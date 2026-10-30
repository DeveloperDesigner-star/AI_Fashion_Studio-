"""Authentication & account schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.core.config import settings
from app.core.security import password_problems
from app.models.enums import UserRole


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class UserRead(ORMModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    role: str
    is_active: bool
    is_verified: bool
    marketing_opt_in: bool
    onboarded_at: datetime | None = None
    created_at: datetime


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=120)
    accept_terms: bool
    marketing_opt_in: bool = False

    @field_validator("full_name")
    @classmethod
    def _clean_name(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if len(cleaned) < 2:
            raise ValueError("Please provide your name")
        return cleaned

    @field_validator("password")
    @classmethod
    def _password_policy(cls, value: str) -> str:
        problems = password_problems(value)
        if problems:
            raise ValueError("Password " + ", ".join(problems))
        return value

    @model_validator(mode="after")
    def _terms(self) -> RegisterRequest:
        if not self.accept_terms:
            raise ValueError("You must accept the terms to create an account")
        return self


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserRead


class UserUpdateRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    marketing_opt_in: bool | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def _password_policy(cls, value: str) -> str:
        problems = password_problems(value)
        if problems:
            raise ValueError("Password " + ", ".join(problems))
        return value


class DeleteAccountRequest(BaseModel):
    password: str
    confirmation: str

    @model_validator(mode="after")
    def _confirm(self) -> DeleteAccountRequest:
        if self.confirmation.strip().upper() != "DELETE":
            raise ValueError('Type "DELETE" to confirm account deletion')
        return self


class AdminUserUpdateRequest(BaseModel):
    role: UserRole | None = None
    is_active: bool | None = None
    is_verified: bool | None = None


class TokenPayload(BaseModel):
    sub: uuid.UUID
    role: str
    type: str
    exp: int


ACCESS_TOKEN_EXPIRES_IN = settings.access_token_expire_minutes * 60
