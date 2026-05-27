"""Google OAuth and JWT auth endpoints."""

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.services.auth import create_access_token, get_or_create_user
from app.services.superuser import is_superuser

router = APIRouter(tags=["auth"])

oauth = OAuth()
oauth.register(
    name="google",
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_id=settings.google_client_id,
    client_secret=settings.google_client_secret,
    client_kwargs={"scope": "openid email profile"},
)


@router.get("/auth/google")
async def auth_google(request: Request):
    """Redirect to Google OAuth."""
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=503,
            detail="Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
        )
    redirect_uri = f"{settings.backend_url.rstrip('/')}/api/v1/auth/callback"
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/auth/callback", name="auth_callback")
async def auth_callback(
    request: Request, response: Response, db: Session = Depends(get_db)
):
    """Handle Google OAuth callback, create/find user, set JWT cookie, redirect to frontend."""
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(status_code=503, detail="Google OAuth not configured.")

    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"OAuth error: {e}")

    userinfo = token.get("userinfo")
    if not userinfo:
        raise HTTPException(status_code=400, detail="No user info from Google.")

    google_id = userinfo.get("sub")
    email = userinfo.get("email", "")
    name = userinfo.get("name")
    picture = userinfo.get("picture")

    if not google_id or not email:
        raise HTTPException(status_code=400, detail="Missing required user info.")

    user = get_or_create_user(
        db, google_id=google_id, email=email, name=name, picture=picture
    )
    jwt_token = create_access_token(user.id)

    # Redirect to /login so SPA routing does not drop ?auth_token= before AuthContext runs.
    base = settings.frontend_url.rstrip("/")
    redirect_url = f"{base}/login?auth_token={jwt_token}"
    response = Response(status_code=302)
    response.headers["Location"] = redirect_url
    return response


@router.get("/auth/me")
async def auth_me(request: Request, db: Session = Depends(get_db)):
    """Return current user from JWT (Authorization header or cookie), or 401."""
    from app.models import User
    from app.services.auth import decode_access_token

    token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        token = request.cookies.get("auth_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    user_id = decode_access_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found.")

    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "picture": user.picture,
        "is_superuser": is_superuser(user),
    }


@router.post("/auth/logout")
async def auth_logout(response: Response):
    """Clear auth cookie."""
    response = Response()
    response.delete_cookie(key="auth_token", path="/")
    return {"ok": True}


@router.get("/auth/dev-available")
async def dev_available():
    """Check if dev login is available (for showing Dev login button)."""
    return {"available": settings.bypass_auth}


@router.get("/auth/dev-login")
async def dev_login(db: Session = Depends(get_db)):
    """Dev-only: login without Google. Set BYPASS_AUTH=true to enable."""
    if not settings.bypass_auth:
        raise HTTPException(status_code=404, detail="Dev login not available.")
    user = get_or_create_user(
        db,
        google_id="dev_local_test",
        email="dev@local.test",
        name="Dev User",
    )
    jwt_token = create_access_token(user.id)
    return {"auth_token": jwt_token}
