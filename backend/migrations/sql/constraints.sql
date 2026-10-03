CREATE UNIQUE INDEX "Incident_one_open_per_monitor" ON "Incident" ("monitorId") WHERE "status" = 'OPEN';
CREATE UNIQUE INDEX "NotificationPreference_global_unique" ON "NotificationPreference" ("userId") WHERE "monitorId" IS NULL;
ALTER TABLE "Monitor" ADD CONSTRAINT "Monitor_valid_configuration" CHECK ("intervalSeconds" >= 30 AND "timeoutMs" >= 1000 AND "timeoutMs" <= 30000 AND "failureThreshold" BETWEEN 1 AND 10 AND "recoveryThreshold" BETWEEN 1 AND 10 AND "method" IN ('GET','HEAD'));
