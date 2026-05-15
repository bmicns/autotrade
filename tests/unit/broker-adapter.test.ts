import test from "node:test";
import assert from "node:assert/strict";

import { DOMESTIC_BROKER_CATALOG } from "../../src/lib/broker/catalog";
import { createPlannedBrokerAdapter } from "../../src/lib/broker/adapters/planned";

test("domestic broker catalog exposes implemented kis and planned domestic brokers", () => {
  const brokerIds = DOMESTIC_BROKER_CATALOG.map((broker) => broker.id).sort();
  assert.deepEqual(brokerIds, ["kb", "kis", "kiwoom", "ls", "mirae", "nh", "samsung"]);
  assert.equal(DOMESTIC_BROKER_CATALOG.find((broker) => broker.id === "kis")?.implementationStatus, "implemented");
  assert.equal(DOMESTIC_BROKER_CATALOG.find((broker) => broker.id === "samsung")?.implementationStatus, "planned");
});

test("planned broker adapters return unsupported responses consistently", async () => {
  const samsung = createPlannedBrokerAdapter("samsung");

  const priceResult = await samsung.fetchPrice({
    code: "005930",
    appKey: "",
    appSecret: "",
    token: "",
    accountNo: "",
    accountProductCode: "01",
  });
  assert.equal(priceResult.ok, false);
  assert.equal(priceResult.status, 501);
  assert.match(String(priceResult.body.error), /시세 조회/);

  const balanceResult = await samsung.fetchBalance({
    appKey: "",
    appSecret: "",
    token: "",
    accountNo: "",
    accountProductCode: "01",
  });
  assert.equal(balanceResult.ok, false);
  assert.equal(balanceResult.status, 501);
  assert.match(String(balanceResult.body.error), /잔고 조회/);

  const healthResult = await samsung.checkHealth();
  assert.equal(healthResult.httpStatus, 501);
  assert.equal(healthResult.status.connected, false);
  assert.equal(healthResult.status.brokerId, "samsung");

  const executionResult = await samsung.resolveDomesticExecutionContext();
  assert.equal(executionResult.ok, false);
  if (!executionResult.ok) {
    assert.equal(executionResult.status, 501);
    assert.match(executionResult.error, /국내 주문 실행/);
  }
});
