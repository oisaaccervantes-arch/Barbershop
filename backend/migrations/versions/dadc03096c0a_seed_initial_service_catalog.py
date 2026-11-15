"""seed initial service catalog

Revision ID: dadc03096c0a
Revises: 4b7c00c45018
Create Date: 2026-08-03 09:33:37.842477

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'dadc03096c0a'
down_revision: Union[str, Sequence[str], None] = '4b7c00c45018'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    services = sa.table(
        "services",
        sa.column("name", sa.String()),
        sa.column("price", sa.Numeric(10, 2)),
        sa.column("type", sa.String()),
        sa.column("active", sa.Boolean()),
        sa.column("display_order", sa.Integer()),
    )

    catalog = [
        {"name": "Corte adulto", "price": 250, "type": "SERVICE", "active": True, "display_order": 1},
        {"name": "Corte niño", "price": 230, "type": "SERVICE", "active": True, "display_order": 2},
        {"name": "Corte y barba", "price": 365, "type": "SERVICE", "active": True, "display_order": 3},
        {"name": "Barba express", "price": 170, "type": "SERVICE", "active": True, "display_order": 4},
        {"name": "Barba premium", "price": 185, "type": "SERVICE", "active": True, "display_order": 5},
        {"name": "Limpieza", "price": 130, "type": "SERVICE", "active": True, "display_order": 6},
        {"name": "Afeitado", "price": 180, "type": "SERVICE", "active": True, "display_order": 7},
        {"name": "Ceja", "price": 110, "type": "SERVICE", "active": True, "display_order": 8},
        {"name": "Tinte", "price": 110, "type": "SERVICE", "active": True, "display_order": 9},
        {"name": "Corte y lavado", "price": 270, "type": "SERVICE", "active": True, "display_order": 10},
        {"name": "Diseño", "price": 100, "type": "EXTRA", "active": True, "display_order": 11},
        {"name": "Decoloración", "price": 600, "type": "EXTRA", "active": True, "display_order": 12},
        {"name": "Corte y barba express", "price": 365, "type": "PACKAGE", "active": True, "display_order": 13},
        {"name": "Corte, barba, mascarilla y lavado", "price": 380, "type": "PACKAGE", "active": True, "display_order": 14},
        {"name": "Corte, barba, mascarilla, tinte y lavado", "price": 400, "type": "PACKAGE", "active": True, "display_order": 15},
    ]

    connection = op.get_bind()
    existing_names = set(connection.execute(sa.select(services.c.name)).scalars())
    missing_services = [item for item in catalog if item["name"] not in existing_names]
    if missing_services:
        op.bulk_insert(services, missing_services)


def downgrade() -> None:
    """Downgrade schema."""
    catalog_names = [
        "Corte adulto",
        "Corte niño",
        "Corte y barba",
        "Barba express",
        "Barba premium",
        "Limpieza",
        "Afeitado",
        "Ceja",
        "Tinte",
        "Corte y lavado",
        "Diseño",
        "Decoloración",
        "Corte y barba express",
        "Corte, barba, mascarilla y lavado",
        "Corte, barba, mascarilla, tinte y lavado",
    ]
    services = sa.table("services", sa.column("name", sa.String()))
    op.execute(services.delete().where(services.c.name.in_(catalog_names)))
