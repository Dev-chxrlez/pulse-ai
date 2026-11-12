import {useEffect, useMemo, useState} from 'react';
import {CalendarDays, Check, ChevronLeft, ChevronRight, Plus, RotateCcw, Sparkles, Trash2} from 'lucide-react';
import {apiRequest, get} from '../api';

export const CATEGORIES = {
  post: 'Posting day', create: 'Create / film', brainstorm: 'Brainstorm', analyze: 'Review results', engage: 'Engage & reply', promo: 'Promo / launch', other: 'Other',
};
const STARTERS = ['Plan my next 2 weeks of content', 'Help me find my niche and target customer', 'Add a posting day every Tue, Thu and Sat this month', 'Plan a launch week for a new product'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = number => String(number).padStart(2, '0');
export const isoDay = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const fromIso = value => {const [y, m, d] = value.split('-').map(Number);return new Date(y, m - 1, d);};
const niceDate = value => fromIso(value).toLocaleDateString(undefined, {weekday: 'short', month: 'short', day: 'numeric'});
const niceTime = value => {if (!value) return '';const [h, m] = value.split(':').map(Number);return `${(h % 12) || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;};
const json = body => ({method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});


export default function Planner() {
  const [events, setEvents] = useState([]);const [chatCount, setChatCount] = useState(0);const [available, setAvailable] = useState(true);const [error, setError] = useState('');
  const today = isoDay(new Date());
  const [month, setMonth] = useState(() => {const now = new Date();return new Date(now.getFullYear(), now.getMonth(), 1);});
  const [selected, setSelected] = useState(today);
  const [draft, setDraft] = useState({title: '', category: 'post', time: ''});
  const [flash, setFlash] = useState([]);
  useEffect(() => {get('planner').then(data => {setEvents(data.events);setChatCount(data.messages.length);setAvailable(data.available);}).catch(failure => setError(failure.message));}, []);
  // POL (the moving robot) plans on the server; show his calendar changes here right away.
  useEffect(() => {
    const onUpdate = ({detail}) => {
      setEvents(detail.events);setChatCount(detail.messages.length);
      const touched = detail.changes.filter(item => item.type !== 'remove').map(item => item.event);
      if (!touched.length) return;
      const first = touched.map(item => item.date).sort()[0];
      setFlash(touched.map(item => item.id));setMonth(fromIso(first.slice(0, 8) + '01'));setSelected(first);setTimeout(() => setFlash([]), 2600);
    };
    window.addEventListener('pulse:planner-updated', onUpdate);return () => window.removeEventListener('pulse:planner-updated', onUpdate);
  }, []);
  async function change(request) {setError('');try {const data = await request();setEvents(data.events);} catch (failure) {setError(failure.message);}}
  const addManual = event => {event.preventDefault();if (!draft.title.trim()) return;change(() => apiRequest('planner/events', json({...draft, date: selected, time: draft.time || null})));setDraft(current => ({...current, title: '', time: ''}));};
  const toggle = item => change(() => apiRequest(`planner/events/${item.id}`, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({done: !item.done})}));
  const remove = item => change(() => apiRequest(`planner/events/${item.id}`, {method: 'DELETE'}));
  async function clearChat() {if (!window.confirm('Clear your conversation with POL? Your calendar stays.')) return;try {await apiRequest('planner/chat', {method: 'DELETE'});setChatCount(0);} catch (failure) {setError(failure.message);}}
  const byDay = useMemo(() => events.reduce((map, event) => {(map[event.date] ||= []).push(event);return map;}, {}), [events]);
  const cells = useMemo(() => {const start = new Date(month);start.setDate(1 - start.getDay());return Array.from({length: 42}, (_, index) => {const day = new Date(start);day.setDate(start.getDate() + index);return day;});}, [month]);
  const upcoming = events.filter(event => event.date >= today && !event.done).slice(0, 6);
  const week = (() => {const end = new Date();end.setDate(end.getDate() + 7);const last = isoDay(end);return events.filter(event => event.date >= today && event.date < last);})();
  const dayItems = byDay[selected] || [];
  return <div className="planner-page">
    <section className="planner-ask">
      <Sparkles size={16}/>
      <p><b>Plan with POL.</b> Click the moving POL above and type anything: talk niche and strategy, or say what to put on your calendar. Or try:</p>
      <div className="planner-starters">{STARTERS.map(starter => <button key={starter} type="button" onClick={() => window.dispatchEvent(new CustomEvent('pulse:pol-plan', {detail: {text: starter}}))} disabled={!available}>{starter}</button>)}</div>
      {chatCount > 0 && <button type="button" className="text-button planner-reset" onClick={clearChat}><RotateCcw size={13}/>New conversation</button>}
    </section>
    {error && <p className="notice error" role="alert">{error}</p>}
    {!available && <p className="notice error">Add OPENAI_API_KEY to server/.env and restart the backend to plan with POL. You can still add plans by hand.</p>}
    <div className="planner-layout">
      <section className="panel planner-calendar">
        <div className="calendar-head">
          <h2><CalendarDays size={17}/>{month.toLocaleDateString(undefined, {month: 'long', year: 'numeric'})}</h2>
          <div className="calendar-nav"><button className="icon-button" aria-label="Previous month" onClick={() => setMonth(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))}><ChevronLeft size={16}/></button><button className="text-button" onClick={() => {const now = new Date();setMonth(new Date(now.getFullYear(), now.getMonth(), 1));setSelected(today);}}>Today</button><button className="icon-button" aria-label="Next month" onClick={() => setMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))}><ChevronRight size={16}/></button></div>
        </div>
        <div className="calendar-grid" role="grid" aria-label="Content calendar">
          {WEEKDAYS.map(day => <span key={day} className="calendar-weekday" role="columnheader">{day}</span>)}
          {cells.map(day => {const key = isoDay(day);const items = byDay[key] || [];const outside = day.getMonth() !== month.getMonth();
            return <button key={key} type="button" role="gridcell" aria-selected={selected === key} aria-label={`${niceDate(key)}${items.length ? `, ${items.length} plan${items.length > 1 ? 's' : ''}` : ''}`} className={`calendar-day ${outside ? 'outside' : ''} ${key === today ? 'today' : ''} ${selected === key ? 'selected' : ''}`} onClick={() => setSelected(key)}>
              <span className="calendar-date">{day.getDate()}</span>
              <span className="calendar-items">{items.slice(0, 3).map(item => <span key={item.id} className={`calendar-pill cat-${item.category} ${item.done ? 'done' : ''} ${flash.includes(item.id) ? 'flash' : ''}`} title={`${item.title}${item.time ? ` · ${niceTime(item.time)}` : ''}`}>{item.title}</span>)}{items.length > 3 && <span className="calendar-more">+{items.length - 3} more</span>}</span>
            </button>;})}
        </div>
        <div className="calendar-legend">{Object.entries(CATEGORIES).map(([key, label]) => <span key={key}><i className={`cat-dot cat-${key}`}/>{label}</span>)}</div>
      </section>
      <div className="planner-side">
      <section className="panel planner-day">
        <div className="panel-title"><div><h2>{selected === today ? 'Today' : niceDate(selected)}</h2><p>{dayItems.length ? `${dayItems.length} plan${dayItems.length > 1 ? 's' : ''}` : 'Nothing planned yet'}</p></div></div>
        <ul className="day-items">{dayItems.map(item => <li key={item.id} className={`${item.done ? 'done' : ''} ${flash.includes(item.id) ? 'flash' : ''}`}>
          <button className={`day-check ${item.done ? 'checked' : ''}`} onClick={() => toggle(item)} aria-label={item.done ? `Mark “${item.title}” not done` : `Mark “${item.title}” done`}>{item.done && <Check size={12} strokeWidth={3}/>}</button>
          <div><strong>{item.title}</strong><small><i className={`cat-dot cat-${item.category}`}/>{CATEGORIES[item.category]}{item.time ? ` · ${niceTime(item.time)}` : ''}{item.createdBy === 'pol' ? ' · by POL' : ''}</small>{item.notes && <p>{item.notes}</p>}</div>
          <button className="icon-button" onClick={() => remove(item)} aria-label={`Delete “${item.title}”`}><Trash2 size={14}/></button>
        </li>)}</ul>
        <form className="day-add" onSubmit={addManual}>
          <input value={draft.title} onChange={event => setDraft(current => ({...current, title: event.target.value}))} placeholder="Add a plan for this day" maxLength={80} aria-label="Plan title"/>
          <select value={draft.category} onChange={event => setDraft(current => ({...current, category: event.target.value}))} aria-label="Type">{Object.entries(CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
          <input type="time" value={draft.time} onChange={event => setDraft(current => ({...current, time: event.target.value}))} aria-label="Time (optional)"/>
          <button className="primary" disabled={!draft.title.trim()}><Plus size={14}/>Add</button>
        </form>
      </section>
      <section className="panel planner-upcoming">
        <div className="panel-title"><div><h2>Up next</h2><p>{week.length} plan{week.length === 1 ? '' : 's'} in the next 7 days · {week.filter(item => item.category === 'post').length} posting</p></div></div>
        {upcoming.length ? <ul className="upcoming-list">{upcoming.map(item => <li key={item.id}><button type="button" onClick={() => {setMonth(fromIso(item.date.slice(0, 8) + '01'));setSelected(item.date);}}><i className={`cat-dot cat-${item.category}`}/><span>{item.title}</span><small>{niceDate(item.date)}{item.time ? ` · ${niceTime(item.time)}` : ''}</small></button></li>)}</ul>
          : <p className="report-caption upcoming-empty">No upcoming plans. Ask POL: “Plan my week”.</p>}
      </section>
      </div>
    </div>
  </div>;
}
