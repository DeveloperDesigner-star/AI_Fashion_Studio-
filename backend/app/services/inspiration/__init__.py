"""External fashion-inspiration sources.

Inspiration is explicitly *not* inventory. Nothing in this package can create a
product, award a verified badge, or be quoted as a price. It answers one
question: "show me reference imagery from a licensed third party".
"""

from app.services.inspiration.pixabay import (
    PIXABAY_ATTRIBUTION,
    PixabayError,
    PixabayService,
    pixabay,
)

__all__ = ["PIXABAY_ATTRIBUTION", "PixabayError", "PixabayService", "pixabay"]
