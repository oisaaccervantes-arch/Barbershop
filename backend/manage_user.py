from getpass import getpass

from sqlalchemy import func, select

from app.database import SessionLocal
from app.models.user import User
from app.security import hash_password


def main() -> None:
    username = input("Usuario: ").strip().lower()
    full_name = input("Nombre para mostrar: ").strip()
    if not username or not full_name:
        raise SystemExit("El usuario y el nombre son obligatorios")
    password = getpass("Contraseña (mínimo 8 caracteres): ")
    confirmation = getpass("Repite la contraseña: ")
    if len(password) < 8 or len(password) > 128:
        raise SystemExit("La contraseña debe tener entre 8 y 128 caracteres")
    if password != confirmation:
        raise SystemExit("Las contraseñas no coinciden")
    with SessionLocal() as db:
        user = db.scalar(select(User).where(func.lower(User.username) == username))
        if user is None:
            user = User(username=username, full_name=full_name, password_hash=hash_password(password))
            db.add(user)
            action = "creado"
        else:
            user.full_name = full_name
            user.password_hash = hash_password(password)
            user.active = True
            action = "actualizado"
        db.commit()
    print(f"Usuario {action} correctamente.")


if __name__ == "__main__":
    main()
