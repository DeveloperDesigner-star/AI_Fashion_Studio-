"""Forwarded client addresses are ignored unless a trusted proxy sets them."""

from __future__ import annotations

from starlette.requests import Request

from app.core.config import settings
from app.core.rate_limit import client_identity


def _request(forwarded: str | None, host: str = "10.0.0.7") -> Request:
    headers = []
    if forwarded is not None:
        headers.append((b"x-forwarded-for", forwarded.encode()))
    return Request({"type": "http", "headers": headers, "client": (host, 1234)})


def test_direct_connection_ignores_forged_forwarded_header(monkeypatch) -> None:
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.setattr(settings, "trust_proxy_headers", False)
    assert client_identity(_request("203.0.113.9")) == "10.0.0.7"


def test_trusted_proxy_uses_the_nearest_hop(monkeypatch) -> None:
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.setattr(settings, "trust_proxy_headers", True)
    assert client_identity(_request("198.51.100.1, 203.0.113.9")) == "203.0.113.9"
    assert client_identity(_request("not-an-ip")) == "not-an-ip"


def test_trusted_proxy_falls_back_to_the_socket_address(monkeypatch) -> None:
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.setattr(settings, "trust_proxy_headers", True)
    assert client_identity(_request(None)) == "10.0.0.7"
    assert client_identity(_request("  ,  ")) == "10.0.0.7"


def test_vercel_edge_is_trusted_automatically(monkeypatch) -> None:
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setattr(settings, "trust_proxy_headers", False)
    assert client_identity(_request("203.0.113.9")) == "203.0.113.9"
