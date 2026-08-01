DROP INDEX "Position_accountId_instrumentId_side_key";

CREATE INDEX "Position_accountId_instrumentId_side_status_idx"
ON "Position"("accountId", "instrumentId", "side", "status");
