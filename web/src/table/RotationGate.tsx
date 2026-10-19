export function RotationGate() {
  return <div className="rotate-gate" role="alert">
    <img className="rotate-watermark" src="/brand/cardford-symbol-mono.svg" alt="" aria-hidden="true" />
    <div className="rotate-logo" role="img" aria-label="CardFord">
      <img src="/brand/cardford-symbol.svg" alt="" /><span>CardFord</span>
    </div>
    <h1>Turn your phone<br />sideways to play.</h1>
    <a className="text-button" href="#account">Account and subscription</a>
    <a className="text-button" href="#demo">Example game</a>
  </div>;
}
