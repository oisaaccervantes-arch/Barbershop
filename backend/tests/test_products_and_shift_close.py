from decimal import Decimal
from types import SimpleNamespace
import unittest

from app.routers.cash_shifts import incomplete_attendance
from app.routers.sales import barber_eligible_subtotal, barber_service_items
from app.schemas.service import ServiceType


class ProductSaleRulesTests(unittest.TestCase):
    def test_product_is_a_supported_catalog_type(self):
        self.assertEqual(ServiceType.product.value, "PRODUCT")

    def test_products_do_not_count_as_barber_work(self):
        items = [
            SimpleNamespace(service_type="SERVICE", line_total=Decimal("250.00")),
            SimpleNamespace(service_type="PRODUCT", line_total=Decimal("80.00")),
            SimpleNamespace(service_type="EXTRA", line_total=Decimal("50.00")),
        ]

        self.assertEqual(len(barber_service_items(items)), 2)
        self.assertEqual(barber_eligible_subtotal(items), Decimal("300.00"))


class IncompleteAttendanceTests(unittest.TestCase):
    def test_missing_punches_are_reported_for_close_reason(self):
        rows = [
            SimpleNamespace(
                person_name="Karem", status="PRESENT", clock_in=None,
                scheduled_meal_start=None, scheduled_meal_end=None,
                meal_out=None, meal_in=None, clock_out=None,
            ),
            SimpleNamespace(
                person_name="Luis", status="PRESENT", clock_in="09:00",
                scheduled_meal_start="14:00", scheduled_meal_end="15:00",
                meal_out="14:00", meal_in=None, clock_out=None,
            ),
        ]

        self.assertEqual(
            incomplete_attendance(rows, "EVENING", lambda _row: False),
            ["Karem (sin entrada)", "Luis (sin regreso de comida)"],
        )

    def test_rest_and_absence_do_not_require_missing_punch_explanation(self):
        rows = [
            SimpleNamespace(
                person_name="Mara", status="REST", clock_in=None,
                scheduled_meal_start=None, scheduled_meal_end=None,
                meal_out=None, meal_in=None, clock_out=None,
            ),
            SimpleNamespace(
                person_name="Nico", status="ABSENT", clock_in=None,
                scheduled_meal_start=None, scheduled_meal_end=None,
                meal_out=None, meal_in=None, clock_out=None,
            ),
        ]

        self.assertEqual(incomplete_attendance(rows, "EVENING", lambda _row: False), [])


if __name__ == "__main__":
    unittest.main()
