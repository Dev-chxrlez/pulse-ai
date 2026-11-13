import {useState} from 'react';
import {RotateCcw, Wand2} from 'lucide-react';
import {apiRequest} from '../api';

// Step 2 of Create. What the user types IS the description (nothing to submit).
// "Polish with AI" optionally rewrites it into a clean summary and says what is still missing.
export default function BriefChat({brandName, description, onDescription, onBrandName}) {
  const [busy, setBusy] = useState(false);const [tip, setTip] = useState('');const [previous, setPrevious] = useState(null);
  const length = description.trim().length;
  async function polish() {
    if (busy || length < 5) return;
    setBusy(true);setTip('');
    try {
      const data = await apiRequest('assistant/brief', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({notes: description.slice(0, 1190), brandName})}, 45000);
      if (data.description) {setPrevious(description);onDescription(data.description.slice(0, 600));}
      if (data.brandName && !brandName.trim()) onBrandName(data.brandName);
      setTip(data.missing?.[0] ? `Tip from POL: ${data.missing[0]}` : 'Looks complete! You can generate now.');
    } catch (failure) {setTip(failure.message || 'POL couldn’t polish it just now. Your text is still used as is.');}
    finally {setBusy(false);}
  }
  return <div className="brief-box">
    <label className="step-label" htmlFor="brief-input">About your business <small>what you sell, best seller, where, hours</small></label>
    <textarea id="brief-input" value={description} onChange={event => {onDescription(event.target.value);setPrevious(null);}} rows={3} maxLength={600} disabled={busy}
      placeholder={'e.g. Coffee shop in Las Piñas. Best seller: iced Spanish latte. Open 7am–10pm, free WiFi.'}/>
    <div className="brief-box-actions">
      <button type="button" className="text-button brief-polish" onClick={polish} disabled={busy || length < 5}><Wand2 size={13}/>{busy ? 'Polishing…' : 'Polish with AI'}</button>
      {previous !== null && !busy && <button type="button" className="text-button" onClick={() => {onDescription(previous);setPrevious(null);setTip('');}}><RotateCcw size={13}/>Undo</button>}
      <small className={`brief-count ${length > 0 && length < 10 ? 'short' : ''}`}>{length > 0 && length < 10 ? 'A bit more, please' : `${description.length}/600`}</small>
    </div>
    {tip && <p className="brief-tip" role="status">{tip}</p>}
  </div>;
}
