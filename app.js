// app.js — two-team rushing MVP
// DB v3: players keyed by team+number
const db = tinyIDB('rv-stats', 3, upgrade => {
  // recreate players store with composite key
  if (upgrade.objectStoreNames.contains('players')) upgrade.deleteObjectStore('players');
  upgrade.createObjectStore('players', { keyPath: 'id' }); // id = `${team}:${num}`
  if (!upgrade.objectStoreNames.contains('games')) upgrade.createObjectStore('games', { keyPath: 'id' });
  if (!upgrade.objectStoreNames.contains('plays')) upgrade.createObjectStore('plays', { keyPath: 'id' });
});

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

const state = {
  gameId: null,
  undoStack: [],
  activeTeam: 'home' // 'home' or 'away'
};

function todayISO(){ const d=new Date(),p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; }
const teamLabel = t => t==='home' ? 'Home' : 'Away';

async function ensureGame(){
  if (state.gameId) return state.gameId;
  const id = `g_${Date.now()}`;
  await db.put('games', { id, createdAt: Date.now(), meta:{} });
  state.gameId = id;
  return id;
}

/* ---------------- ROSTERS ---------------- */
function renderPlayers(players){
  const list = $('#playersList'); list.innerHTML='';
  const sorted = players.sort((a,b)=>a.num-b.num);
  for(const p of sorted){
    const row = document.createElement('div');
    row.className = 'spaced';
    row.innerHTML = `<div class="flex"><span class="pill">${teamLabel(p.team)} • #${p.num}</span> ${p.name||''}</div>
      <button class="ghost tight" data-del="${p.id}">Remove</button>`;
    list.appendChild(row);
  }
  const sel = $('#rushPlayer');
  const onlyActive = sorted.filter(p=>p.team===state.activeTeam);
  sel.innerHTML = onlyActive.map(p=>`<option value="${p.num}">#${p.num} ${p.name||''}</option>`).join('');
}

async function refreshPlayers(){
  renderPlayers(await db.getAll('players'));
}

async function addPlayer(){
  const num = parseInt($('#pnum').value,10);
  if (Number.isNaN(num)) return alert('Enter jersey #');
  const name = $('#pname').value.trim();
  const id = `${state.activeTeam}:${num}`;
  await db.put('players', { id, team: state.activeTeam, num, name });
  $('#pnum').value=''; $('#pname').value='';
  refreshPlayers();
}

async function deletePlayer(id){ await db.delete('players', id); refreshPlayers(); }

/* ---------------- PLAYS ---------------- */
async function addRushPlay(){
  await ensureGame();
  const playerNum = parseInt($('#rushPlayer').value,10);
  if (Number.isNaN(playerNum)) return alert('Pick a runner');
  const yards = parseInt($('#rushYards').value,10);
  if (Number.isNaN(yards)) return alert('Enter yards (+/-)');
  const td = $('#rushTD').checked;
  const fum = $('#rushFum').checked;
  const qtr = $('#quarter').value;

  const play = {
    id:`p_${Date.now()}`,
    gameId: state.gameId,
    team: state.activeTeam,     // <-- important
    type: 'run',
    qtr, playerNum, yards, td, fum,
    ts: Date.now()
  };
  await db.put('plays', play);
  state.undoStack.push(play.id);
  $('#rushYards').value=''; $('#rushTD').checked=false; $('#rushFum').checked=false;
  renderRecent(); renderTotals();
}

async function undoLast(){
  const id = state.undoStack.pop();
  if(!id) return;
  await db.delete('plays', id);
  renderRecent(); renderTotals();
}

/* ---------------- RENDER ---------------- */
function sum(a,sel=x=>x){ return a.reduce((m,x)=>m+sel(x),0); }
function groupBy(a,k){ return a.reduce((m,x)=>((m[x[k]]??=[]).push(x),m),{}); }

async function renderRecent(){
  const plays = (await db.getAll('plays'))
    .filter(p => p.gameId===state.gameId && p.type==='run' && (p.team||'home')===state.activeTeam)
    .sort((a,b)=>b.ts-a.ts)
    .slice(0,12);

  $('#recentPlays').innerHTML = '<h2>Recent</h2>' + plays.map(p=>{
    const badge = p.td ? ' 🟢 TD' : (p.fum ? ' 🔴 FUM' : '');
    return `<div class="muted">${teamLabel(p.team||'home')} • Q${p.qtr} – #${p.playerNum} ${p.yards}y${badge}</div>`;
  }).join('');
}

async function calcTeamTables(team){
  const plays = (await db.getAll('plays')).filter(p=>p.gameId===state.gameId && p.type==='run' && (p.team||'home')===team);
  const teamCarries = plays.length, teamYds = sum(plays,p=>p.yards),
        teamTD = plays.filter(p=>p.td).length,
        teamFum = plays.filter(p=>p.fum).length,
        teamLong = plays.length? Math.max(...plays.map(p=>p.yards)) : 0;

  const teamTable = `
    <table>
      <thead><tr><th>${teamLabel(team)} Rushing</th><th>CAR</th><th>YDS</th><th>AVG</th><th>TD</th><th>FUM</th><th>LONG</th></tr></thead>
      <tbody><tr><td>Total</td><td>${teamCarries}</td><td>${teamYds}</td><td>${teamCarries?(teamYds/teamCarries).toFixed(1):'0.0'}</td><td>${teamTD}</td><td>${teamFum}</td><td>${teamLong}</td></tr></tbody>
    </table>`;

  // by runner
  const players = await db.getAll('players');
  const nameOf = (team,num) => (players.find(p=>p.team===team && p.num===Number(num))?.name)||'';
  const byRunner = groupBy(plays,'playerNum');
  const rows = Object.entries(byRunner).map(([num,arr])=>{
    const car=arr.length, yds=sum(arr,p=>p.yards), td=arr.filter(p=>p.td).length, fum=arr.filter(p=>p.fum).length, lng=Math.max(...arr.map(p=>p.yards)), avg=car?(yds/car).toFixed(1):'0.0';
    return `<tr><td>#${num} ${nameOf(team, Number(num))}</td><td>${car}</td><td>${yds}</td><td>${avg}</td><td>${td}</td><td>${fum}</td><td>${lng}</td></tr>`;
  }).join('');

  const playersTable = `
    <table>
      <thead><tr><th>Player</th><th>CAR</th><th>YDS</th><th>AVG</th><th>TD</th><th>FUM</th><th>LONG</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7" class="muted" style="text-align:center">No plays yet.</td></tr>'}</tbody>
    </table>`;

  return { teamTable, playersTable };
}

async function renderTotals(){
  $('#playCount').textContent = '—'; // per-team badges below
  const h = await calcTeamTables('home');
  const a = await calcTeamTables('away');

  $('#teamTotals').innerHTML = h.teamTable + a.teamTable;
  $('#playerTotals').innerHTML = `
    <h3>${teamLabel('home')}</h3>${h.playersTable}
    <h3 style="margin-top:16px">${teamLabel('away')}</h3>${a.playersTable}
  `;
}

/* ---------------- EXPORT / RESET ---------------- */
async function exportCSV(){
  await ensureGame();
  const meta = {
    opponent: $('#opponent').value.trim(),
    date: $('#gamedate').value || todayISO(),
    score: $('#score').value.trim(),
    notes: $('#notes').value.trim()
  };
  const plays = (await db.getAll('plays')).filter(p=>p.gameId===state.gameId && p.type==='run');
  const header = 'gameId,date,opponent,team,quarter,player,yards,td,fumble\n';
  const rows = plays.map(p=>[state.gameId, meta.date, meta.opponent, p.team, p.qtr, p.playerNum, p.yards, p.td?1:0, p.fum?1:0].join(','));
  const csv = header + rows.join('\n');
  const blob = new Blob([csv], {type:'text/csv'}); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `rv_rushing_${meta.date.replaceAll('-','')}.csv`; a.click();
  URL.revokeObjectURL(url);
}

async function resetAll(){
  if(!confirm('Delete ALL data for this app?')) return;
  await db.clear('plays'); await db.clear('players'); state.undoStack=[];
  refreshPlayers(); renderRecent(); renderTotals();
}

/* ---------------- WIRE ---------------- */
function wire(){
  $('#gamedate').value = todayISO();

  // team switcher
  $$('#teamSwitch input[name="teamSel"]').forEach(r=>{
    r.addEventListener('change', e=>{
      state.activeTeam = e.target.value;
      refreshPlayers(); renderRecent(); renderTotals();
    });
  });

  $('#addPlayer').addEventListener('click', addPlayer);
  $('#playersList').addEventListener('click', e=>{ if(e.target.dataset.del) deletePlayer(e.target.dataset.del); });

  $$('#rush-card button[data-inc]').forEach(b=>b.addEventListener('click', ()=>{
    const v = parseInt($('#rushYards').value||0,10);
    $('#rushYards').value = v + parseInt(b.dataset.inc,10);
  }));

  $('#addRush').addEventListener('click', addRushPlay);
  $('#undoBtn').addEventListener('click', undoLast);
  $('#endGameBtn').addEventListener('click', exportCSV);
  $('#resetBtn').addEventListener('click', resetAll);

  $('#quickSeed').addEventListener('click', async ()=>{
    const nums = [1,2,3,4,5,6,7,8,9,10,11,12,17,21,22,24,32];
    for(const n of nums){
      const id = `${state.activeTeam}:${n}`;
      await db.put('players', { id, team: state.activeTeam, num:n, name:'' });
    }
    refreshPlayers();
  });
}

async function start(){ await ensureGame(); wire(); refreshPlayers(); renderRecent(); renderTotals(); }
start();
