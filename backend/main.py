from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.sessions import router as sessions_router
from app.api.accounts import router as accounts_router
from app.api.devices import router as devices_router
from app.api.notifications import router as notifications_router
from app.api.users import router as users_router
from app.api.message_requests import router as message_requests_router
from app.api.direct_messages import router as direct_messages_router

app = FastAPI(title="LockTalk Prototype")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(
    request: Request, exception: RequestValidationError
):
    return JSONResponse(
        status_code=422,
        content={"detail": "Invalid request data."},
    )


app.include_router(accounts_router)
app.include_router(sessions_router)
app.include_router(devices_router)
app.include_router(notifications_router)
app.include_router(users_router)
app.include_router(message_requests_router)
app.include_router(direct_messages_router)

@app.get("/health")
def health():
    return {"status": "ok", "project": "LockTalk"}