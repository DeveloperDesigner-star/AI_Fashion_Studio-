"""Production workflow state machine for marketplace print orders.

The ten production states are deliberately explicit so a customer can see where
their order actually is. Transitions are validated server-side; the API never
lets a client set an arbitrary status.
"""

from __future__ import annotations

import uuid

from app.models.business import OrderEvent, QuoteRequest
from app.models.enums import ProductionStatus

ORDER = ProductionStatus.ORDER_RECEIVED.value
QUOTE_PENDING = ProductionStatus.QUOTE_PENDING.value
QUOTE_APPROVED = ProductionStatus.QUOTE_APPROVED.value
DESIGN_APPROVED = ProductionStatus.DESIGN_APPROVED.value
PRODUCTION_PENDING = ProductionStatus.PRODUCTION_PENDING.value
PRINTING = ProductionStatus.PRINTING_IN_PROGRESS.value
QUALITY_CHECK = ProductionStatus.QUALITY_CHECKING.value
READY = ProductionStatus.READY_FOR_DELIVERY.value
COMPLETED = ProductionStatus.COMPLETED.value
CANCELLED = ProductionStatus.CANCELLED.value

# Forward edges only; "cancelled" is handled separately because it is allowed
# from most states but not from terminal ones.
TRANSITIONS: dict[str, frozenset[str]] = {
    ORDER: frozenset({QUOTE_PENDING}),
    QUOTE_PENDING: frozenset({QUOTE_APPROVED}),
    QUOTE_APPROVED: frozenset({DESIGN_APPROVED}),
    DESIGN_APPROVED: frozenset({PRODUCTION_PENDING}),
    PRODUCTION_PENDING: frozenset({PRINTING}),
    PRINTING: frozenset({QUALITY_CHECK}),
    # A failed inspection sends the job back to printing, or forward to delivery.
    QUALITY_CHECK: frozenset({READY, PRINTING}),
    READY: frozenset({COMPLETED}),
    COMPLETED: frozenset(),
    CANCELLED: frozenset(),
}

CUSTOMER = "customer"
BUSINESS = "business"
ADMIN = "admin"

# Which actor may push the order into a given state.
ACTORS: dict[str, frozenset[str]] = {
    QUOTE_PENDING: frozenset({BUSINESS, ADMIN}),
    QUOTE_APPROVED: frozenset({CUSTOMER, ADMIN}),
    DESIGN_APPROVED: frozenset({CUSTOMER, ADMIN}),
    PRODUCTION_PENDING: frozenset({BUSINESS, ADMIN}),
    PRINTING: frozenset({BUSINESS, ADMIN}),
    QUALITY_CHECK: frozenset({BUSINESS, ADMIN}),
    READY: frozenset({BUSINESS, ADMIN}),
    COMPLETED: frozenset({CUSTOMER, ADMIN}),
}

CANCELLABLE = frozenset(
    {ORDER, QUOTE_PENDING, QUOTE_APPROVED, DESIGN_APPROVED, PRODUCTION_PENDING, PRINTING, QUALITY_CHECK, READY}
)


class TransitionError(Exception):
    def __init__(self, code: str, message: str, *, allowed: list[str] | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.allowed = allowed or []


def actor_role(user, order: QuoteRequest, owns_business: bool) -> str:
    """Resolve what the current user is allowed to be for this order."""
    from app.models.enums import UserRole

    if user.role == UserRole.ADMIN:
        return ADMIN
    if owns_business:
        return BUSINESS
    if order.user_id == user.id:
        return CUSTOMER
    raise TransitionError("forbidden", "This order does not belong to you.")


def allowed_targets(current: str, role: str) -> list[str]:
    """States ``role`` could move to from ``current`` right now."""
    targets = [state for state in TRANSITIONS.get(current, ()) if role in ACTORS.get(state, ())]
    if current in CANCELLABLE and role in {CUSTOMER, BUSINESS, ADMIN}:
        targets.append(CANCELLED)
    return sorted(targets)


def transition(
    db,
    order: QuoteRequest,
    target: ProductionStatus,
    *,
    role: str,
    actor_id: uuid.UUID | None,
    note: str | None = None,
) -> OrderEvent:
    """Move ``order`` to ``target``, appending an audit event.

    Raises :class:`TransitionError` without mutating anything when the move is
    not permitted for this role.
    """

    current = order.production_status or ORDER
    value = target.value
    if value == current:
        raise TransitionError("same_status", "The order is already in that state.")
    if value == CANCELLED:
        if current not in CANCELLABLE:
            raise TransitionError(
                "not_cancellable", "This order can no longer be cancelled.", allowed=allowed_targets(current, role)
            )
        order.cancelled_at = _now()
        order.cancellation_reason = (note or "").strip() or "Cancelled by request."
    else:
        if value not in TRANSITIONS.get(current, frozenset()):
            raise TransitionError(
                "invalid_transition",
                f"Cannot move from {current.replace('_', ' ')} to {value.replace('_', ' ')}.",
                allowed=allowed_targets(current, role),
            )
        if role not in ACTORS.get(value, frozenset()):
            permitted = ", ".join(sorted(ACTORS.get(value, frozenset())))
            raise TransitionError(
                "forbidden_transition",
                f"Only the {permitted} can move an order to {value.replace('_', ' ')}.",
                allowed=allowed_targets(current, role),
            )

    order.production_status = value
    order.updated_at = _now()
    if value == DESIGN_APPROVED:
        order.design_approved_at = _now()
    if value == COMPLETED:
        order.completed_at = _now()
        from app.models.enums import OrderStatus

        order.status = OrderStatus.COMPLETED.value
    if value in {QUOTE_APPROVED, DESIGN_APPROVED, PRODUCTION_PENDING, PRINTING, QUALITY_CHECK, READY, COMPLETED}:
        from app.models.enums import OrderStatus

        if order.status in {OrderStatus.SUBMITTED.value, OrderStatus.DRAFT.value}:
            order.status = OrderStatus.CONFIRMED.value

    event = OrderEvent(
        order_id=order.id,
        actor_id=actor_id,
        from_status=current,
        to_status=value,
        note=(note or "").strip() or None,
    )
    db.add(event)
    db.flush()
    return event


def _now():
    from datetime import UTC, datetime

    return datetime.now(UTC)
