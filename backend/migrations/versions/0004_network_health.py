"""Store DNS and TLS health separately from page availability incidents."""

import sqlalchemy as sa
from alembic import op


revision = "0004_network_health"
down_revision = "0003_email_otp"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "Monitor", sa.Column("dnsStatus", sa.String(), nullable=False, server_default="UNKNOWN")
    )
    op.add_column("Monitor", sa.Column("dnsAddress", sa.Text(), nullable=True))
    op.add_column("Monitor", sa.Column("dnsError", sa.Text(), nullable=True))
    op.add_column("Monitor", sa.Column("dnsCheckedAt", sa.DateTime(), nullable=True))
    op.add_column(
        "Monitor",
        sa.Column("tlsStatus", sa.String(), nullable=False, server_default="NOT_APPLICABLE"),
    )
    op.add_column("Monitor", sa.Column("tlsExpiresAt", sa.DateTime(), nullable=True))
    op.add_column("Monitor", sa.Column("tlsDaysRemaining", sa.Integer(), nullable=True))
    op.add_column("Monitor", sa.Column("tlsError", sa.Text(), nullable=True))
    op.add_column("Monitor", sa.Column("tlsCheckedAt", sa.DateTime(), nullable=True))
    op.create_table(
        "NetworkAlert",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column(
            "monitorId", sa.Text(), sa.ForeignKey("Monitor.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("cause", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("OPEN", "RESOLVED", name="IncidentStatus", create_type=False),
            nullable=False,
        ),
        sa.Column("startedAt", sa.DateTime(), nullable=False),
        sa.Column("resolvedAt", sa.DateTime(), nullable=True),
        sa.Column("createdAt", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_NetworkAlert_monitorId", "NetworkAlert", ["monitorId"])
    op.create_index(
        "NetworkAlert_monitor_kind_started", "NetworkAlert", ["monitorId", "kind", "startedAt"]
    )
    op.execute(
        'CREATE UNIQUE INDEX "NetworkAlert_one_open_per_kind" ON "NetworkAlert" ("monitorId", kind) WHERE status=\'OPEN\''
    )
    op.alter_column("NotificationDelivery", "incidentId", existing_type=sa.Text(), nullable=True)
    op.add_column("NotificationDelivery", sa.Column("networkAlertId", sa.Text(), nullable=True))
    op.add_column("NotificationDelivery", sa.Column("monitorId", sa.Text(), nullable=True))
    op.create_foreign_key(
        "NotificationDelivery_network_alert_fk",
        "NotificationDelivery",
        "NetworkAlert",
        ["networkAlertId"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "NotificationDelivery_monitor_fk",
        "NotificationDelivery",
        "Monitor",
        ["monitorId"],
        ["id"],
        ondelete="CASCADE",
    )
    op.execute(
        'UPDATE "NotificationDelivery" delivery SET "monitorId"=incident."monitorId" '
        'FROM "Incident" incident WHERE delivery."incidentId"=incident.id'
    )
    op.create_index("ix_NotificationDelivery_monitorId", "NotificationDelivery", ["monitorId"])


def downgrade():
    op.drop_index("ix_NotificationDelivery_monitorId", table_name="NotificationDelivery")
    op.drop_constraint(
        "NotificationDelivery_monitor_fk", "NotificationDelivery", type_="foreignkey"
    )
    op.drop_constraint(
        "NotificationDelivery_network_alert_fk", "NotificationDelivery", type_="foreignkey"
    )
    op.drop_column("NotificationDelivery", "monitorId")
    op.drop_column("NotificationDelivery", "networkAlertId")
    op.alter_column("NotificationDelivery", "incidentId", existing_type=sa.Text(), nullable=False)
    op.execute('DROP INDEX "NetworkAlert_one_open_per_kind"')
    op.drop_table("NetworkAlert")
    for column in (
        "tlsCheckedAt",
        "tlsError",
        "tlsDaysRemaining",
        "tlsExpiresAt",
        "tlsStatus",
        "dnsCheckedAt",
        "dnsError",
        "dnsAddress",
        "dnsStatus",
    ):
        op.drop_column("Monitor", column)
