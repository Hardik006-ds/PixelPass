import { useState } from "react";
import { useStore } from "../context/Store.jsx";
import { Explain, PageHeader } from "../components/ui.jsx";
import { DIFFICULTY, checkChain, tamperBlock } from "../lib/engine.js";
import { fmtTime, shortHash } from "../lib/format.js";
import { nameOf } from "../lib/roles.js";

function BlockCard({ block, status, onTamper, tampered }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(block.tx.text);
  const bad = !status.ok;
  return (
    <li className={`block ${bad ? "block-bad" : ""} ${tampered ? "block-edited" : ""}`}>
      <div className="block-head">
        <span>BLOCK #{block.index}</span>
        <span className="block-time">{fmtTime(block.timestamp)}</span>
      </div>
      <div className="block-what">{block.tx.text}</div>
      <dl className="block-kv">
        <dt>Fingerprint</dt>
        <dd className={status.workOk && status.hashOk ? "ok" : "bad"} title={block.hash}>
          {shortHash(block.hash, 16)}
          {!status.workOk && " (not mined: does not start with " + DIFFICULTY + ")"}
        </dd>
        <dt>Previous</dt>
        <dd className={status.linkOk ? "" : "bad"} title={block.previousHash}>
          {shortHash(block.previousHash, 16)}
          {!status.linkOk && " (does NOT match the block before)"}
        </dd>
        <dt>Mining tries</dt>
        <dd>{block.nonce.toLocaleString("en-IN")}</dd>
      </dl>
      {block.index > 0 && (
        <div className={`block-link ${status.linkOk ? "ok" : "bad"}`}>
          {status.linkOk ? `Linked to block #${block.index - 1}` : `BROKEN LINK to block #${block.index - 1}`}
        </div>
      )}
      {block.index > 0 && !editing && (
        <button className="btn btn-small btn-red" onClick={() => setEditing(true)}>
          Tamper with this block
        </button>
      )}
      {editing && (
        <div className="tamper-form">
          <label>
            Change what happened
            <input value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <div className="row">
            <button
              className="btn btn-small btn-red"
              onClick={() => {
                onTamper(block.index, text);
                setEditing(false);
              }}
            >
              Save the change
            </button>
            <button className="btn btn-small" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function Blockchain() {
  const { state, chainCopy, setChainCopy, toast } = useStore();
  const [lastCheck, setLastCheck] = useState(null);
  const view = chainCopy || state.chain;
  const result = checkChain(view);
  const byIndex = Object.fromEntries(result.results.map((r) => [r.index, r]));
  const editedIndex = chainCopy ? chainCopy.findIndex((b, i) => b.tx.text !== state.chain[i]?.tx.text) : -1;

  const tamper = (index, text) => {
    setChainCopy(tamperBlock(view, index, text));
    setLastCheck(null);
    toast({
      tone: "red",
      title: `Block #${index} was edited`,
      body: "Its fingerprint changed, so the next block no longer points to it. The chain is broken.",
    });
  };

  const runCheck = () => {
    const r = checkChain(view);
    setLastCheck({ ...r, total: view.length, time: Date.now() });
  };

  return (
    <>
      <PageHeader title="THE BLOCKCHAIN" kicker={`${view.length} BLOCKS`}>
        Every action in PIXELPASS is stored here as a block. Newest at the top.
      </PageHeader>

      <Explain title="HOW A BLOCKCHAIN STAYS HONEST">
        <ol className="plain-list">
          <li>
            Each block has a <b>fingerprint</b> (a SHA-256 hash) made from everything inside it.
          </li>
          <li>
            Each block also stores the <b>previous block's fingerprint</b>. That is the "chain".
          </li>
          <li>
            New blocks must be <b>mined</b>: the computer tries numbers until the fingerprint starts with "{DIFFICULTY}". The
            "mining tries" count shows how many attempts it took.
          </li>
          <li>
            If someone edits an old block, its fingerprint changes and the next block no longer matches. Try it with{" "}
            <b>Tamper with this block</b>.
          </li>
        </ol>
      </Explain>

      <div className={`chain-status ${result.ok ? "good" : "bad"}`}>
        <div className="chain-status-text">
          <strong>{result.ok ? "CHAIN IS VALID" : `CHAIN IS BROKEN AT BLOCK #${result.firstBad}`}</strong>
          <span>
            {result.ok
              ? "Every block's fingerprint is correct and every link matches."
              : "Somebody edited history. This copy no longer agrees with the rest of the network."}
          </span>
        </div>
        <div className="row">
          <button className="btn btn-green" onClick={runCheck}>
            Check the whole chain
          </button>
          {chainCopy && (
            <button
              className="btn btn-yellow"
              onClick={() => {
                setChainCopy(null);
                setLastCheck(null);
                toast({ tone: "green", title: "Restored", body: "The honest copy was taken from the other computers in the network." });
              }}
            >
              Restore from the network
            </button>
          )}
        </div>
      </div>

      {lastCheck && (
        <div className={`msg ${lastCheck.ok ? "msg-ok" : "msg-error"}`}>
          <strong className="msg-title">{lastCheck.ok ? "PASS" : "FAIL"}</strong>
          <span>
            {lastCheck.ok
              ? `Checked all ${lastCheck.total} blocks from the newest back to the first. Every link matches.`
              : `Checked ${lastCheck.total} blocks. Block #${lastCheck.firstBad} does not match. Everything after it is untrustworthy.`}
          </span>
        </div>
      )}

      <div className="network">
        <div className="node good">
          <span className="node-name">Computer A</span>
          <span>honest copy</span>
        </div>
        <div className="node good">
          <span className="node-name">Computer B</span>
          <span>honest copy</span>
        </div>
        <div className={`node ${chainCopy && !result.ok ? "bad" : "good"}`}>
          <span className="node-name">This computer</span>
          <span>{chainCopy && !result.ok ? "edited, outvoted 2 to 1" : "honest copy"}</span>
        </div>
      </div>
      <p className="hint">
        The blockchain is copied on many computers. If one copy is edited, it no longer matches the others and is
        rejected.
      </p>

      <ol className="block-chain">
        {view
          .slice()
          .reverse()
          .map((b) => (
            <BlockCard
              key={`${b.index}-${b.hash}`}
              block={b}
              status={byIndex[b.index]}
              onTamper={tamper}
              tampered={b.index === editedIndex}
            />
          ))}
      </ol>

      <h2 className="section-title">REJECTED ATTEMPTS (NEVER ADDED TO THE CHAIN)</h2>
      {state.rejected.length === 0 ? (
        <p className="muted">Nothing rejected yet. Try the Fraud Lab.</p>
      ) : (
        <ul className="rejected">
          {state.rejected.map((r, i) => (
            <li key={i}>
              <span className="rej-time">{fmtTime(r.time)}</span>
              <span className="rej-what">
                {r.text} <i>({nameOf(r.by)})</i>
              </span>
              <span className="rej-why">{r.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
