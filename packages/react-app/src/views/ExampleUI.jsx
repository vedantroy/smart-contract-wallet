/* eslint-disable jsx-a11y/accessible-emoji */

import React, { useState } from "react";
import { NETWORKS } from "../constants";
import { Button, Divider, Card } from "antd";
import { Address, Contract } from "../components";
import FunctionForm from "../components/Contract/FunctionForm";
import { parseEther, formatEther } from "@ethersproject/units";
import { useEventListener, useGasPrice } from "../hooks";

const targetNetwork = NETWORKS["localhost"];

export default function ExampleUI({
  address,
  mainnetProvider,
  userProvider,
  localProvider,
  yourLocalBalance,
  price,
  blockExplorer,
  tx,
  readContracts,
  writeContracts,
}) {
  async function getUpdate(updateIdx, typ) {
    if (!readContracts) return null;
    const { YourContract } = readContracts;
    const update = await YourContract.updates(updateIdx);
    const { executed, numConfirmations } = update;
    if (typeof executed !== "boolean") {
      throw new Error(`Expected executed to be boolean, it was: ${typeof executed}`);
    }
    const numConfirmationsAsInt = parseInt(numConfirmations.toString());
    const updateIdxAsInt = parseInt(updateIdx.toString());
    const updatePretty = {
      executed,
      confirmations: numConfirmationsAsInt,
      updateIdx: updateIdxAsInt,
      typ: typ,
    };
    switch (typ) {
      case 0:
        const guardianInfo = await YourContract.addGuardianInfo(updateIdx);
        if (typeof guardianInfo !== "string") {
          throw new Error(`Expected type to be string, it was: ${typeof guardianInfo}`);
        }
        updatePretty.typName = "Add Guardian";
        updatePretty.data = {
          guardianAddress: guardianInfo,
        };
        break;
      case 1:
        const changeConfirmationInfo = await YourContract.changeConfirmationInfo(updateIdx);
        updatePretty.typName = "Change Transaction Confirmation Threshold";
        updatePretty.data = {
          newThreshold: changeConfirmationInfo.toString(),
        };
        break;
      case 2:
        const [toAddr, value] = await YourContract.transactionInfo(updateIdx);
        updatePretty.typName = "Execute Long Transaction";
        updatePretty.data = {
          to: toAddr,
          value: value.toString(),
        };
        break;
      case 3:
        const [newOwner, endTime] = await YourContract.recoveryInfo(updateIdx);
        updatePretty.typName = "Recovery";
        updatePretty.data = {
          newOwner: newOwner,
          endTime: endTime,
        };
        break;
      default:
        throw new Error(`Unexpected type: ${typ}`);
    }
    return updatePretty;
  }

  const signer = userProvider.getSigner();
  const gasPrice = useGasPrice(targetNetwork, "fast");
  const [refreshRequired, triggerRefresh] = useState(false);

  const [owner, setOwner] = useState(null);
  if (readContracts) {
    const { YourContract } = readContracts;
    YourContract.owner()
      .then(_owner => {
        if (_owner !== owner) {
          setOwner(_owner);
        }
      })
      .catch(err => {
        console.log(err);
      });
  }

  const [guardianMajority, setGM] = useState(null);
  if (readContracts) {
    const { YourContract } = readContracts;
    YourContract.guardianMajority()
      .then(_gm => {
        if (_gm.toString() !== guardianMajority) {
          setGM(_gm.toString());
        }
      })
      .catch(err => {
        console.log(err);
      });
  }

  const [updates, setUpdates] = useState([]);
  const [guardians, setGuardians] = useState([]);

  if (readContracts) {
    const { YourContract } = readContracts;
    YourContract.getGuardians()
      .then(xs => {
        if (xs.length !== guardians.length) {
          setGuardians(xs);
        }
      })
      .catch(err => {
        console.log(err);
      });
  }

  const updateEvents = useEventListener(readContracts, "YourContract", "UpdateAdded", localProvider, 1);
  const promises = [];
  for (let i = 0; i < updateEvents.length; i++) {
    const e = updateEvents[i];
    const { updateIdx, typ } = e;
    promises.push(getUpdate(updateIdx, typ));
  }
  Promise.all(promises)
    .then(newUpdates => {
      if (newUpdates.length > updates.length) {
        setUpdates(newUpdates);
      }
    })
    .catch(err => {
      console.log(err);
    });

  const confirmationEvents = useEventListener(readContracts, "YourContract", "ConfirmationAdded", localProvider, 1);
  const updateIdToConfirmedGuardians = {};
  for (let i = 0; i < confirmationEvents.length; i++) {
    const e = confirmationEvents[i];
    const { guardian, updateIdx } = e;
    const updateIdxAsInt = parseInt(updateIdx.toString());
    if (!updateIdToConfirmedGuardians[updateIdxAsInt]) {
      updateIdToConfirmedGuardians[updateIdx] = new Set();
    }
    updateIdToConfirmedGuardians[updateIdx].add(guardian);
  }

  return (
    <div>
      <div style={{ border: "1px solid #cccccc", padding: 16, width: "100%", margin: "64px 32px 32px" }}>
        <h1>Updates</h1>
        {updates.map(u => {
          const { data } = u;
          const alreadyVoted = Array.from(updateIdToConfirmedGuardians[u.updateIdx] || []);
          // TODO: Add already voted check
          const shouldRenderConfirmButton =
            !u.executed &&
            guardians.includes(address) &&
            !(updateIdToConfirmedGuardians[u.updateIdx] || new Set()).has(address);
          const shouldRenderExecuteButton =
            !u.executed && (address === owner || (u.typ === 3 && guardians.includes(address)));
          return (
            <Card title={`${u.updateIdx} - ${u.typName}`} style={{ textAlign: "left" }}>
              <p style={{ margin: "0px" }}>
                <b>Confirmations:</b> {u.confirmations}
              </p>
              <p style={{ margin: "0px" }}>
                <b>Executed:</b> {JSON.stringify(u.executed)}
              </p>
              <p style={{ margin: "0px" }}>
                <b>Data:</b>
              </p>
              {Object.entries(data).map(([k, v]) => (
                <p style={{ margin: "0px" }}>
                  <i>- {k}:</i> {v.toString()}
                </p>
              ))}
              <br />
              <b>Confirmed:</b>
              {alreadyVoted.map(_address => (
                <div>
                  <br />
                  <Address key={_address} value={_address} ensProvider={mainnetProvider} fontsize={5} />
                </div>
              ))}
              <br />
              {shouldRenderConfirmButton ? (
                <Button
                  type="primary"
                  style={{ marginTop: "10px" }}
                  onClick={() => {
                    tx(writeContracts.YourContract.confirmUpdate(u.updateIdx));
                  }}
                >
                  Confirm
                </Button>
              ) : null}
              {shouldRenderExecuteButton ? (
                <Button
                  type="primary"
                  style={{ marginTop: "10px" }}
                  onClick={() => {
                    switch (u.typ) {
                      case 0:
                        tx(writeContracts.YourContract.executeGuardianAdd(u.updateIdx));
                        break;
                      case 1:
                        tx(writeContracts.YourContract.executeConfirmationChange(u.updateIdx));
                        break;
                      case 2:
                        tx(writeContracts.YourContract.executeLongTxn(u.updateIdx));
                        break;
                      case 3:
                        tx(writeContracts.YourContract.executeRecovery(u.updateIdx));
                        break;
                      default:
                        throw new Error(`Unexpected type: ${u.typ}`);
                    }
                  }}
                >
                  Execute
                </Button>
              ) : null}
            </Card>
          );
        })}
        <Divider />
        <h1>Guardians</h1>
        {guardians.map(_address => (
          <div>
            <Address key={_address} value={_address} ensProvider={mainnetProvider} fontSize={20} />
            <br />
          </div>
        ))}
        {owner ? (
          <div>
            <Divider />
            <h1>Owner:</h1>
            <Address value={owner} ensProvider={mainnetProvider} fontSize={20} />
          </div>
        ) : null}
        <Divider />
        {guardianMajority ? (
          <div>
            <Divider />
            <div>
              <b>Guardian Confirmations Required:</b> {guardianMajority}
            </div>
          </div>
        ) : null}
        <Divider />
        <b>Smart Contract (Wallet) Address: </b>
        <Address
          value={readContracts ? readContracts.YourContract.address : readContracts}
          ensProvider={mainnetProvider}
          fontSize={20}
        />
        <Divider />
        {owner === address ? (
          <div>
            <h2>Owner Control Panel</h2>
            <Contract
              name="YourContract"
              signer={userProvider.getSigner()}
              provider={localProvider}
              address={address}
              blockExplorer={blockExplorer}
              show={[
                "addFirstGuardian",
                "tryImmediateTxn",
                "submitLongTxn",
                "submitThresholdChange",
                "submitGuardianAdd",
                "executeLongTxn",
                "executeConfirmationChange",
                "executeGuardianAdd",
              ]}
            />
          </div>
        ) : null}
        {guardians.includes(address) ? (
          <div>
            <h2>Guardian Control Panel</h2>
            <Contract
              name="YourContract"
              signer={userProvider.getSigner()}
              provider={localProvider}
              address={address}
              blockExplorer={blockExplorer}
              show={["submitRecovery", "revokeConfirmation", "confirmUpdate", "executeRecovery"]}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
