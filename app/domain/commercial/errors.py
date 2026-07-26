from __future__ import annotations


class CommercialServiceError(Exception):
    def __init__(
        self,
        status_code: int,
        error_code: str,
        message: str,
        *,
        data: dict[str, object] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.error_code = error_code
        self.message = message
        self.data = data or {}


class CommercialNotFoundError(CommercialServiceError):
    def __init__(
        self,
        error_code: str,
        message: str,
        *,
        data: dict[str, object] | None = None,
    ) -> None:
        super().__init__(404, error_code, message, data=data)


class CommercialConflictError(CommercialServiceError):
    def __init__(
        self,
        error_code: str,
        message: str,
        *,
        data: dict[str, object] | None = None,
    ) -> None:
        super().__init__(409, error_code, message, data=data)


class CommercialPermissionError(CommercialServiceError):
    def __init__(
        self,
        error_code: str,
        message: str,
        *,
        data: dict[str, object] | None = None,
    ) -> None:
        super().__init__(403, error_code, message, data=data)


class CommercialValidationError(CommercialServiceError):
    def __init__(
        self,
        error_code: str,
        message: str,
        *,
        data: dict[str, object] | None = None,
    ) -> None:
        super().__init__(400, error_code, message, data=data)
