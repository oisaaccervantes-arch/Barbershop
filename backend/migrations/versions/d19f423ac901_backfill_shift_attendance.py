"""backfill shift attendance

Revision ID: d19f423ac901
Revises: bc843e3da012
Create Date: 2026-08-09
"""
from typing import Sequence, Union

from alembic import op

revision: str = "d19f423ac901"
down_revision: Union[str, Sequence[str], None] = "bc843e3da012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO attendance_records
            (shift_id, person_type, person_id, person_name, status, notes)
        SELECT cs.id, 'RECEPTIONIST', r.id, r.name,
               CASE WHEN cs.status = 'CLOSED' THEN 'PERMISSION' ELSE 'PENDING' END,
               CASE WHEN cs.status = 'CLOSED' THEN 'Turno anterior a la implementación del checador' ELSE NULL END
        FROM cash_shifts cs
        JOIN receptionists r ON r.id = cs.receptionist_id
        WHERE NOT EXISTS (
            SELECT 1 FROM attendance_records ar
            WHERE ar.shift_id = cs.id AND ar.person_type = 'RECEPTIONIST' AND ar.person_id = r.id
        )
    """)
    op.execute("""
        INSERT INTO attendance_records
            (shift_id, person_type, person_id, person_name, status, notes)
        SELECT cs.id, 'BARBER', b.id, b.name,
               CASE WHEN cs.status = 'CLOSED' THEN 'PERMISSION' ELSE 'PENDING' END,
               CASE WHEN cs.status = 'CLOSED' THEN 'Turno anterior a la implementación del checador' ELSE NULL END
        FROM cash_shifts cs
        JOIN shift_barbers sb ON sb.shift_id = cs.id
        JOIN barbers b ON b.id = sb.barber_id
        WHERE NOT EXISTS (
            SELECT 1 FROM attendance_records ar
            WHERE ar.shift_id = cs.id AND ar.person_type = 'BARBER' AND ar.person_id = b.id
        )
    """)


def downgrade() -> None:
    op.execute("DELETE FROM attendance_records WHERE notes = 'Turno anterior a la implementación del checador'")
