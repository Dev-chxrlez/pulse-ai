import {useEffect, useRef, useState} from 'react';
import {Send} from 'lucide-react';
import {apiRequest} from '../api';


// Chat that builds the ad's business description. Every user message refines one summary;
// the summary (editable) is what the ad generator uses. Facts only, nothing invented.
export default function BriefChat({brandName, description, onDescription, onBrandName}) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');const [busy, setBusy] = useState(false);const [editing, setEditing] = useState(false);
  const notes = useRef([]);const list = useRef();
  useEffect(() => {list.current?.scrollTo({top: list.current.scrollHeight, behavior: 'smooth'});}, [messages, busy]);
  async function send() {
    const message = text.trim();
    if (!message || busy) return;
    setText('');setMessages(current => [...current, {from: 'you', text: message}]);setBusy(true);
    notes.current = [...notes.current, message];
    // Keep the most recent notes within the helper's 1,200-character limit.
    let joined = notes.current.join('\n');
    while (joined.length > 1150 && notes.current.length > 1) {notes.current = notes.current.slice(1);joined = notes.current.join('\n');}
    if (description && !joined.includes(description.slice(0, 40))) joined = `Current summary: ${description}\nNew notes: ${joined}`.slice(-1190);
    try {
      const data = await apiRequest('assistant/brief', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({notes: joined, brandName})}, 45000);
      onDescription(data.description);
      if (data.brandName && !brandName.trim()) onBrandName(data.brandName);
      const follow = data.missing?.[0];
      setMessages(current => [...current, {from: 'pol', text: follow ? `Got it! I updated your summary below. One more thing: ${follow}` : 'Got it! Your summary below looks complete. Press Generate video when you’re ready. ✨'}]);
    } catch (failure) {
      setMessages(current => [...current, {from: 'pol', text: failure.message || 'Sorry, I couldn’t catch that. Please try again.'}]);
    } finally {setBusy(false);}
  }
  return <div className="brief-chat">
    <label className="brief-chat-label" htmlFor="brief-chat-input">Describe your business <small>(what you sell, what makes it special, where to buy, hours; the ad uses only what you type)</small></label>
    {(messages.length > 0 || busy) && <div className="brief-chat-list" ref={list} aria-live="polite">
      {messages.map((message, index) => <div key={index} className={`brief-msg from-${message.from}`}>{message.text}</div>)}
      {busy && <div className="brief-msg from-pol thinking"><span className="agent-thinking">Thinking<i>.</i><i>.</i><i>.</i></span></div>}
    </div>}
    <div className="brief-chat-input">
      <input id="brief-chat-input" value={text} onChange={event => setText(event.target.value)} onKeyDown={event => {if (event.key === 'Enter') {event.preventDefault();send();}}} placeholder="e.g. coffee shop sa Las Piñas, best seller iced Spanish latte, open 7am–10pm" maxLength={600} disabled={busy} aria-label="Describe your business"/>
      <button type="button" onClick={send} disabled={busy || !text.trim()} aria-label="Send"><Send size={15}/></button>
    </div>
    {description && <div className="brief-summary">
      <div className="brief-summary-head"><span className="eyebrow">YOUR AD WILL SAY</span><button type="button" className="text-button" onClick={() => setEditing(value => !value)}>{editing ? 'Done' : 'Edit'}</button></div>
      {editing ? <textarea value={description} onChange={event => onDescription(event.target.value)} maxLength={600} rows={4} aria-label="Business description"/> : <p>{description}</p>}
    </div>}
  </div>;
}
