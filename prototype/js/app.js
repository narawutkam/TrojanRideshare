/**
 * Shared app logic for Trojan Rideshare pages (index.html, party.html).
 *
 * Holds the data store (trips, chats, signed-in user) plus formatting helpers.
 * For this prototype the store lives in the browser's localStorage, so it
 * survives refreshes but is per-browser. In production every function in the
 * "Store" section becomes an API call to the backend.
 *
 * Requires regions/regions.js to be loaded first.
 */
(function () {
  "use strict";
  const { REGIONS, PICKUPS, pointInPolygon, centroid, distanceKm } = window.LARegions;
  const MAX_SIZE = 6;
  const LATE_CANCEL_HOURS = 2;   // leaving inside this window costs a cancellation fee
  const LEAVE_CUTOFF_HOURS = 1;  // inside this window you can't leave at all
  const KEY = "trojanRideshare.v1";

  const regionById = Object.fromEntries(REGIONS.map((r) => [r.id, r]));
  const pickupById = Object.fromEntries(PICKUPS.map((p) => [p.id, p]));
  /** Strict rule: bookable only if the point is INSIDE a region polygon. */
  const regionFor = (lat, lng) => REGIONS.find((r) => pointInPolygon(lat, lng, r.polygon)) || null;
  const dropoffOf = (regionId) => centroid(regionById[regionId].polygon); // Uber drops everyone at the region center
  const fareFor = (pickupId, regionId) => Math.round(12 + distanceKm(pickupById[pickupId], dropoffOf(regionId)) * 2.2);

  // ---------- Helpers ----------
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtTime = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const fmtDay = (d) => {
    const today = new Date(); const tmr = new Date(); tmr.setDate(today.getDate() + 1);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === tmr.toDateString()) return "Tomorrow";
    return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  };
  const walkMin = (km) => Math.max(1, Math.round(((km * 1.3) / 5) * 60)); // street detour 1.3x, 5 km/h
  const fmtWalk = (km) => `${km.toFixed(1)} km (~${walkMin(km)} min walk)`;
  const initials = (n) => n.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join("");
  const toLocalInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const setStatus = (el, kind, html) => { el.className = "status" + (kind ? ` show ${kind}` : ""); el.innerHTML = html || ""; };
  function toast(msg) {
    let t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 3500);
  }

  // ---------- Sample data ----------
  const SAMPLE_PEOPLE = {
    maya: { name: "Maya Chen", rating: 4.9, rides: 23 }, jordan: { name: "Jordan Lee", rating: 4.7, rides: 11 }, priya: { name: "Priya Patel", rating: 5.0, rides: 8 },
    alex: { name: "Alex Romero", rating: 4.8, rides: 31 }, sam: { name: "Sam Okafor", rating: 4.6, rides: 5 }, hannah: { name: "Hannah Kim", rating: 4.9, rides: 17 },
    diego: { name: "Diego Alvarez", rating: 4.5, rides: 3 }, chris: { name: "Chris Nguyen", rating: 4.8, rides: 14 }, ella: { name: "Ella Brooks", rating: 4.9, rides: 9 },
  };
  Object.entries(SAMPLE_PEOPLE).forEach(([k, p]) => { p.email = `${k}@usc.edu`; });

  function seedTrips(startId) {
    let id = startId;
    const at = (dayOffset, h, m = 0) => { const d = new Date(); d.setDate(d.getDate() + dayOffset); d.setHours(h, m, 0, 0); return d; };
    const P = (name, lat, lng) => ({ name, lat, lng });
    const R = (who, dest, size = 1) => ({ who: SAMPLE_PEOPLE[who], dest, size, returnOptIn: false });
    const make = (pickup, departAt, riders, returnAt = null) => {
      const region = regionFor(riders[0].dest.lat, riders[0].dest.lng);
      return { id: id++, sample: true, regionId: region.id, pickup, departAt, riders, returnAt, estTotal: fareFor(pickup, region.id) };
    };
    const trips = [
      make("village", at(0, 19, 0), [R("maya", P("The Grove", 34.0720, -118.3575), 2), R("ella", P("Melrose Trading Post", 34.0835, -118.3620))], at(0, 22, 30)),
      make("evk", at(0, 16, 30), [R("jordan", P("Santa Monica Pier", 34.0094, -118.4973), 3), R("hannah", P("Third Street Promenade", 34.0160, -118.4963), 2)]),
      make("webb", at(0, 20, 15), [R("priya", P("Hollywood Palladium", 34.0983, -118.3243), 2)], at(1, 0, 30)),
      make("village", at(1, 7, 0), [R("alex", P("LAX Terminal B", 33.9416, -118.4085), 1), R("chris", P("LAX Terminal 4", 33.9430, -118.4040), 3)]),
      make("village", at(2, 16, 0), [R("sam", P("SoFi Stadium", 33.9535, -118.3392), 4), R("diego", P("Kia Forum", 33.9583, -118.3419), 2)], at(2, 23, 0)),
      make("evk", at(1, 18, 30), [R("hannah", P("Sawtelle Japantown", 34.0393, -118.4425))]),
      make("webb", at(0, 21, 0), [R("diego", P("The Wiltern", 34.0617, -118.3089), 3), R("ella", P("Koreatown Plaza", 34.0573, -118.3089))], at(1, 1, 0)),
      make("village", at(3, 17, 30), [R("chris", P("Dodger Stadium", 34.0739, -118.2400), 2)], at(3, 22, 30)),
      make("village", at(2, 11, 0), [R("maya", P("Abbot Kinney Blvd", 33.9915, -118.4686), 3)]),
      make("evk", at(1, 13, 0), [R("priya", P("Rodeo Drive", 34.0696, -118.4031), 2)]),
    ];
    return { trips, nextId: id };
  }

  // ---------- Store (becomes backend API calls in production) ----------
  const reviveTrip = (t) => ({ ...t, departAt: new Date(t.departAt), returnAt: t.returnAt ? new Date(t.returnAt) : null });
  const reviveMsg = (m) => ({ ...m, at: new Date(m.at) });
  let db;

  function load() {
    let d = null;
    try { const raw = localStorage.getItem(KEY); if (raw) d = JSON.parse(raw); } catch { /* storage blocked: start fresh */ }
    if (d) {
      d.trips = d.trips.map(reviveTrip);
      Object.keys(d.chats || {}).forEach((k) => { d.chats[k] = d.chats[k].map(reviveMsg); });
    } else d = { user: null, strikes: 0, trips: [], chats: {}, nextId: 1, seededOn: null };
    // Refresh the sample trips once a day so there's always something upcoming.
    // Trips the signed-in user is part of are kept.
    const today = new Date().toDateString();
    if (d.seededOn !== today) {
      const keep = d.trips.filter((t) => !t.sample || t.riders.some((r) => d.user && r.who.email === d.user.email));
      const s = seedTrips(d.nextId);
      d.trips = [...keep, ...s.trips]; d.nextId = s.nextId; d.seededOn = today;
    }
    return d;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* ignore */ } }
  db = load(); save();

  const isMe = (who) => !!(db.user && who && who.email === db.user.email);
  const taken = (t) => t.riders.reduce((s, r) => s + r.size, 0);
  const booker = (t) => t.riders[0].who;
  const isActive = (t) => t.departAt > new Date(Date.now() - 3 * 36e5); // trip still current until 3h after departure
  const getTrip = (id) => db.trips.find((t) => t.id === +id) || null;
  const myRider = (t) => t.riders.find((r) => isMe(r.who)) || null;
  /** The one trip the signed-in user is registered for (one at a time). */
  const myTrip = () => (db.user ? db.trips.find((t) => isActive(t) && myRider(t)) || null : null);

  function chatOf(id) { return (db.chats[id] = db.chats[id] || []); }
  function sys(id, text) { chatOf(id).push({ from: null, text, at: new Date() }); }
  function say(id, who, text) { chatOf(id).push({ from: { name: who.name, email: who.email }, text, at: new Date() }); }

  function signIn(email) {
    const name = email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    db.user = { email: email.toLowerCase(), name, rating: 5.0, rides: 0 }; save();
    return db.user;
  }
  function signOut() { db.user = null; save(); }

  /** Returns { trip, overflow } or throws Error(message). */
  function joinTrip(tripId, dest, size, returnOptIn) {
    if (!db.user) throw new Error("Sign in first.");
    if (myTrip()) throw new Error("You're already registered for a trip. Leave it before joining another.");
    const t = getTrip(tripId);
    if (!t || !isActive(t)) throw new Error("That trip is no longer available.");
    if (!dest || regionFor(dest.lat, dest.lng)?.id !== t.regionId) throw new Error("Your destination must be inside this trip's region.");
    const me = { who: { ...db.user }, dest, size, returnOptIn: !!returnOptIn && !!t.returnAt };
    if (size > MAX_SIZE - taken(t)) {
      // Spec: sign-ups over 6 create a new trip listing (same region/time/pickup) with this user as booker.
      const nt = { id: db.nextId++, regionId: t.regionId, pickup: t.pickup, departAt: t.departAt, returnAt: me.returnOptIn ? t.returnAt : null,
        riders: [me], estTotal: t.estTotal };
      db.trips.push(nt);
      sys(nt.id, `${db.user.name} created this trip (party of ${size}) because the original listing was full.`);
      save(); return { trip: nt, overflow: true };
    }
    t.riders.push(me);
    const chat = chatOf(t.id);
    if (!chat.length && !isMe(booker(t))) {
      say(t.id, booker(t), `Hey everyone! I'll book the Uber from ${pickupById[t.pickup].name} at ${fmtTime(t.departAt)}. Please be there 5 minutes early 🙌`);
    }
    sys(t.id, `${db.user.name} joined${size > 1 ? ` with a party of ${size}` : ""} · headed to ${dest.name.split(",")[0]}`);
    save(); return { trip: t, overflow: false };
  }

  function createTrip({ dest, pickup, departAt, size, returnAt }) {
    if (!db.user) throw new Error("Sign in first.");
    if (myTrip()) throw new Error("You're already registered for a trip. Leave it before creating another.");
    const region = regionFor(dest.lat, dest.lng);
    if (!region) throw new Error("That destination isn't inside a ride region.");
    const t = { id: db.nextId++, regionId: region.id, pickup, departAt, returnAt: returnAt || null,
      riders: [{ who: { ...db.user }, dest, size, returnOptIn: !!returnAt }], estTotal: fareFor(pickup, region.id) };
    db.trips.push(t);
    sys(t.id, `${db.user.name} created this trip${size > 1 ? ` with a party of ${size}` : ""} and is the Uber booker.`);
    save(); return t;
  }

  /** All trips the user is/was in: the current one plus past ones (newest first). */
  function myTrips() {
    if (!db.user) return { current: null, past: [] };
    const mine = db.trips.filter((t) => myRider(t));
    return { current: myTrip(), past: mine.filter((t) => !isActive(t)).sort((a, b) => b.departAt - a.departAt) };
  }

  /**
   * Whether the user may leave a trip right now, and what it costs.
   * > 2h before departure: free. 1-2h: allowed with cancellation fee. < 1h: not allowed.
   */
  function leaveInfo(t) {
    const msLeft = t.departAt - new Date();
    const allowed = msLeft > LEAVE_CUTOFF_HOURS * 36e5;
    const late = msLeft < LATE_CANCEL_HOURS * 36e5;
    const cutoffAt = new Date(+t.departAt - LEAVE_CUTOFF_HOURS * 36e5);
    let reason;
    if (msLeft <= 0) reason = "This trip has already departed.";
    else if (!allowed) reason = `You can't leave within ${LEAVE_CUTOFF_HOURS} hour of departure. Your party is counting on you. If you can't make it, message them in the party chat; a no-show adds a strike.`;
    else if (late) reason = `It's less than ${LATE_CANCEL_HOURS} hours before departure, so leaving now costs a cancellation fee. You can't leave at all after ${fmtTime(cutoffAt)}.`;
    else reason = `You can leave for free until ${fmtTime(new Date(+t.departAt - LATE_CANCEL_HOURS * 36e5))}. After that there's a cancellation fee, and after ${fmtTime(cutoffAt)} you can't leave.`;
    return { allowed, late, cutoffAt, reason };
  }

  /** Leave the trip. Returns { late } so the UI can mention the cancellation fee. */
  function leaveTrip(tripId) {
    const t = getTrip(tripId); const r = t && myRider(t);
    if (!r) throw new Error("You're not in this trip.");
    const info = leaveInfo(t);
    if (!info.allowed) throw new Error(info.reason);
    const late = info.late;
    const wasBooker = t.riders[0] === r;
    t.riders = t.riders.filter((x) => x !== r);
    if (!t.riders.length) { db.trips = db.trips.filter((x) => x !== t); delete db.chats[t.id]; }
    else {
      sys(t.id, `${db.user.name} left the trip.`);
      if (wasBooker) sys(t.id, `${t.riders[0].who.name} is now the Uber booker.`);
    }
    save(); return { late };
  }

  function sendMessage(tripId, text) {
    const t = getTrip(tripId);
    if (!t || !myRider(t)) throw new Error("Only party members can chat.");
    say(tripId, db.user, text.trim());
    save();
  }

  /** Booker-only: change departure time / pickup. Posts a notice to the chat. */
  function updateTrip(tripId, { departAt, pickup }) {
    const t = getTrip(tripId);
    if (!t || !isMe(booker(t))) throw new Error("Only the booker can edit trip details.");
    const changes = [];
    if (departAt && +departAt !== +t.departAt) { changes.push(`departure → ${fmtDay(departAt)} ${fmtTime(departAt)}`); t.departAt = departAt; }
    if (pickup && pickup !== t.pickup) { changes.push(`pickup → ${pickupById[pickup].name}`); t.pickup = pickup; t.estTotal = fareFor(pickup, t.regionId); }
    if (changes.length) sys(t.id, `${db.user.name} updated the trip: ${changes.join(", ")}.`);
    save(); return changes.length > 0;
  }

  /** Shared "Leave this trip?" dialog. Calls onLeft() after a successful leave. */
  function confirmLeave(t, onLeft) {
    const info = leaveInfo(t);
    if (!info.allowed) { toast(info.reason); return; }
    let bd = document.getElementById("leave-modal-shared");
    if (!bd) {
      bd = document.createElement("div");
      bd.id = "leave-modal-shared"; bd.className = "backdrop";
      bd.innerHTML = `<div class="modal" role="dialog" aria-labelledby="lm-title"><h3 id="lm-title">Leave this trip?</h3>
        <p class="sub" id="lm-text"></p><div class="modal-actions"><button class="btn btn-ghost" data-lm-close>Stay in trip</button>
        <button class="btn btn-primary" id="lm-go">Leave trip</button></div></div>`;
      document.body.appendChild(bd);
      bd.addEventListener("click", (e) => { if (e.target === bd || e.target.closest("[data-lm-close]")) bd.classList.remove("open"); });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape") bd.classList.remove("open"); });
    }
    const iAmBooker = isMe(booker(t)), others = t.riders.length > 1;
    bd.querySelector("#lm-text").innerHTML = [
      `<b>${escapeHtml(regionById[t.regionId].name)}</b> · ${fmtDay(t.departAt)} at ${fmtTime(t.departAt)}`,
      info.late ? `<b>A cancellation fee applies</b> because it's less than ${LATE_CANCEL_HOURS} hours before departure.` : "No fee: it's more than 2 hours before departure.",
      iAmBooker && others ? `You're the booker, so <b>${escapeHtml(t.riders[1].who.name)}</b> will take over booking the Uber.` : "",
      iAmBooker && !others ? "You're the only one in this trip, so the listing will be removed." : "",
    ].filter(Boolean).join("<br><br>");
    const go = bd.querySelector("#lm-go");
    go.textContent = info.late ? "Leave and pay fee" : "Leave trip";
    go.onclick = () => {
      try { leaveTrip(t.id); bd.classList.remove("open"); onLeft(); }
      catch (err) { bd.classList.remove("open"); toast(err.message); }
    };
    bd.classList.add("open");
  }

  /** Header user menu shared by all pages. */
  function renderHeaderUser(el, { onSignOut } = {}) {
    if (!db.user) return false;
    el.innerHTML = `<div class="user"><div><div>${escapeHtml(db.user.name)}</div><div class="strikes">${db.strikes}/3 strikes</div></div>
      <div class="avatar">${initials(db.user.name)}</div>${onSignOut ? `<button class="btn btn-ghost" data-signout style="color:#fff;border-color:rgba(255,255,255,.4);padding:6px 10px">Sign out</button>` : ""}</div>`;
    if (onSignOut) el.querySelector("[data-signout]").onclick = () => { signOut(); onSignOut(); };
    return true;
  }

  /** Re-read storage (another tab changed it) and call cb. */
  function onExternalChange(cb) {
    window.addEventListener("storage", (e) => { if (e.key === KEY) { db = load(); cb(); } });
  }

  window.App = {
    MAX_SIZE, LATE_CANCEL_HOURS, LEAVE_CUTOFF_HOURS, REGIONS, PICKUPS, regionById, pickupById, regionFor, dropoffOf, distanceKm,
    escapeHtml, fmtTime, fmtDay, fmtWalk, initials, toLocalInput, setStatus, toast,
    get user() { return db.user; }, get strikes() { return db.strikes; }, get trips() { return db.trips; },
    chatOf, isMe, taken, booker, isActive, getTrip, myRider, myTrip, myTrips, leaveInfo,
    signIn, signOut, joinTrip, createTrip, leaveTrip, confirmLeave, renderHeaderUser, sendMessage, updateTrip, onExternalChange, save,
  };
})();
