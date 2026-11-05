/* Lançamentos PCP — coleta de produção em campo (offline-first) */
'use strict';
const VERSAO = '1.1.0';
const MESES = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
const CABECALHO = ['Data','Mês','Setor','Produto','Turno','Qtde.','Kg Processado','Tipo'];

let CAD = window.CADASTRO_PADRAO;      // cadastro ativo (pode ser substituído pela planilha)
let entries = [];                      // lançamentos do levantamento atual
let meta = { dataLev: ontem(), ultimoExport: null, exportCount: 0, alteradoAposExport: false, setor: null, turno: null };
let tab = 'lancar', busca = '', soDup = false;
let pesoIdx = {};

/* ---------- utilidades ---------- */
function isoDe(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function hoje(){ return isoDe(new Date()); }
// Padrão: dia anterior ao de hoje (o levantamento é sempre da produção do dia anterior)
function ontem(){ const d=new Date(); d.setDate(d.getDate()-1); return isoDe(d); }
const DIAS=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
function diaSemana(iso){ const [y,m,d]=iso.split('-').map(Number); return DIAS[new Date(y,m-1,d).getDay()]; }
function fmtData(iso){ const [y,m,d]=iso.split('-'); return d+'/'+m+'/'+y; }
function mesDe(iso){ return MESES[parseInt(iso.slice(5,7),10)-1]; }
function esc(s){ return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function norm(s){ return String(s??'').trim().toUpperCase(); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
function fmtNum(n,dec){ return n.toLocaleString('pt-BR',{minimumFractionDigits:dec,maximumFractionDigits:dec}); }
function $(sel,root=document){ return root.querySelector(sel); }
function reindexPeso(){ pesoIdx={}; for(const [k,v] of Object.entries(CAD.peso)) pesoIdx[norm(k)]=v; }
// Mesma regra da planilha: Kg = Qtde × PROCV(Produto; Peso Bello; "Peça Caixa") ; Tipo = PROCV(...; "MP")
function pesoDe(produto){ return pesoIdx[norm(produto)] || null; }
function kgDe(e){ const p=pesoDe(e.produto); return p ? e.qtde*(p.qc*p.pp) : null; }
function tipoDe(e){ const p=pesoDe(e.produto); return p && p.mp ? p.mp : null; }
function foraDaLista(setor,produto){ return !(CAD.porSetor[setor]||[]).some(p=>norm(p)===norm(produto)); }
function chaveDup(e){ return [e.data,e.setor,e.turno,norm(e.produto)].join('|'); }
function mapaDup(){ const m={}; for(const e of entries){ const k=chaveDup(e); m[k]=(m[k]||0)+1; } return m; }

/* ---------- armazenamento: IndexedDB + espelho em localStorage ---------- */
const DB = { db:null,
  open(){ return new Promise((res,rej)=>{ if(!('indexedDB' in window)) return rej(new Error('sem IndexedDB'));
    const r=indexedDB.open('pcp-lancamentos',1);
    r.onupgradeneeded=()=>{ const d=r.result; d.createObjectStore('entries',{keyPath:'id'}); d.createObjectStore('meta',{keyPath:'k'}); };
    r.onsuccess=()=>{ this.db=r.result; res(); }; r.onerror=()=>rej(r.error); }); },
  tx(store,mode,fn){ return new Promise((res,rej)=>{ const t=this.db.transaction(store,mode); const out=fn(t.objectStore(store)); t.oncomplete=()=>res(out&&out.result); t.onerror=()=>rej(t.error); t.onabort=()=>rej(t.error); }); },
  all(store){ return new Promise((res,rej)=>{ const r=this.db.transaction(store).objectStore(store).getAll(); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); },
};
let dbOk = false;
function espelhar(){ try{ localStorage.setItem('pcp-espelho', JSON.stringify({entries, meta})); }catch(_){} }
async function salvarEntry(e){ espelhar(); if(dbOk) await DB.tx('entries','readwrite',s=>s.put(e)); }
async function apagarEntry(id){ espelhar(); if(dbOk) await DB.tx('entries','readwrite',s=>s.delete(id)); }
async function salvarMeta(){ espelhar(); if(dbOk) await DB.tx('meta','readwrite',s=>s.put({k:'meta',v:meta})); }
async function salvarTudo(){ espelhar(); if(!dbOk) return; await DB.tx('entries','readwrite',s=>{ s.clear(); entries.forEach(e=>s.put(e)); }); await DB.tx('meta','readwrite',s=>s.put({k:'meta',v:meta})); }

async function carregar(){
  try{ await DB.open(); dbOk=true; }catch(err){ dbOk=false; }
  let esp=null; try{ esp=JSON.parse(localStorage.getItem('pcp-espelho')||'null'); }catch(_){}
  if(dbOk){
    entries = await DB.all('entries');
    const ms = await DB.all('meta');
    for(const m of ms){ if(m.k==='meta') meta=Object.assign(meta,m.v); if(m.k==='cadastro' && m.v) CAD=m.v; }
    if(!entries.length && esp && esp.entries && esp.entries.length){ entries=esp.entries; meta=Object.assign(meta,esp.meta||{}); await salvarTudo(); }
  } else if(esp){ entries=esp.entries||[]; meta=Object.assign(meta,esp.meta||{}); }
  else { try{ const c=JSON.parse(localStorage.getItem('pcp-cadastro')||'null'); if(c) CAD=c; }catch(_){} }
  entries.sort((a,b)=>a.criadoEm-b.criadoEm);
  if(!entries.length) meta.dataLev = ontem();
  reindexPeso();
}
let persistPedido=false;
async function pedirPersistencia(){ if(persistPedido) return; persistPedido=true; try{ if(navigator.storage && navigator.storage.persist) await navigator.storage.persist(); }catch(_){} }

/* ---------- interface ---------- */
function toast(msg,err){ const h=$('#toastHost'); h.innerHTML='<div class="toast'+(err?' err':'')+'">'+esc(msg)+'</div>'; clearTimeout(toast.t); toast.t=setTimeout(()=>h.innerHTML='',err?4000:1800); }
function fecharSheet(){ $('#sheetHost').innerHTML=''; }
function abrirSheet(html,onMount){ const h=$('#sheetHost'); h.innerHTML='<div class="sheet-bg"><div class="sheet" role="dialog">'+html+'</div></div>';
  const bg=$('.sheet-bg',h); bg.addEventListener('click',ev=>{ if(ev.target===bg) fecharSheet(); }); onMount && onMount($('.sheet',h)); }

function render(){
  document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('on',b.dataset.tab===tab));
  $('#nRev').textContent = entries.length ? '('+entries.length+')' : '';
  $('#dataLev').value = meta.dataLev;
  const avisos=[];
  if(!dbOk) avisos.push('Armazenamento principal indisponível neste navegador — usando armazenamento reserva. Faça backups com frequência.');
  if(meta.dataLev>hoje()) avisos.push('Atenção: a data escolhida ('+fmtData(meta.dataLev)+') é no futuro.');
  else if(meta.dataLev===hoje()) avisos.push('Atenção: a data escolhida é hoje, e não o dia anterior.');
  if(!navigator.onLine) avisos.push('Sem conexão — tudo continua sendo salvo no aparelho.');
  $('#notice').innerHTML = '<div class="diaLev">Produção de <b>'+diaSemana(meta.dataLev)+', '+fmtData(meta.dataLev)+'</b></div>' + avisos.map(a=>'<div class="notice">'+esc(a)+'</div>').join('');
  const v=$('#view');
  if(tab==='lancar') v.innerHTML=telaLancar(); else if(tab==='revisar') v.innerHTML=telaRevisar(); else v.innerHTML=telaExportar();
  ligar(v);
}

function contagem(filtro){ return entries.filter(filtro).length; }

function telaLancar(){
  const {setor,turno}=meta;
  let h='<div class="crumbs">';
  h+= setor ? '<button class="chip" data-act="trocaSetor">Setor: <b>'+esc(setor)+'</b> ✕</button>' : '<span class="chip ghost">1. Setor</span>';
  if(setor) h+= turno ? '<button class="chip" data-act="trocaTurno">Turno: <b>'+esc(turno)+'</b> ✕</button>' : '<span class="chip ghost">2. Turno</span>';
  h+='</div>';
  if(!setor){
    h+='<h2>Escolha o setor</h2><div class="grid">';
    for(const s of CAD.setores){ const n=contagem(e=>e.setor===s && e.data===meta.dataLev);
      h+='<button class="big" data-setor="'+esc(s)+'">'+esc(s)+(n?'<small>'+n+' lanç.</small>':'')+'</button>'; }
    return h+'</div>';
  }
  if(!turno){
    h+='<h2>Escolha o turno</h2><div class="grid two">';
    for(const t of CAD.turnos){ const n=contagem(e=>e.setor===setor && e.turno===t && e.data===meta.dataLev);
      h+='<button class="big" data-turno="'+esc(t)+'">'+esc(t)+(n?'<small>'+n+' lanç.</small>':'')+'</button>'; }
    return h+'</div>';
  }
  const prods=(CAD.porSetor[setor]||[]);
  const ja={}; for(const e of entries) if(e.setor===setor && e.turno===turno && e.data===meta.dataLev){ const k=norm(e.produto); (ja[k]=ja[k]||[]).push(e.qtde); }
  const extras=Object.keys(ja).filter(k=>!prods.some(p=>norm(p)===k));
  h+='<input class="search" id="busca" type="search" placeholder="Filtrar produto…" value="'+esc(busca)+'" autocomplete="off">';
  h+='<h2>Produto — '+prods.length+' no setor</h2><div class="list" id="lista">';
  const item=(p,extra)=>{ const q=ja[norm(p)];
    return '<button class="prod" data-prod="'+esc(p)+'" data-search="'+esc(norm(p))+'"><span>'+esc(p)+'</span>'+
      (extra?'<i class="badge b-info">outro item</i>':'')+
      (q?'<i class="badge '+(q.length>1?'b-warn':'b-ok')+'">✓ '+q.map(x=>fmtNum(x,0)).join(' + ')+'</i>':'')+'</button>'; };
  for(const p of prods) h+=item(p,false);
  for(const k of extras){ const e=entries.find(x=>norm(x.produto)===k); h+=item(e.produto,true); }
  h+='<button class="prod other" data-act="outro">＋ Outro item (fora da lista do setor)</button></div>';
  return h;
}

function telaRevisar(){
  if(!entries.length) return '<div class="empty">Nenhum lançamento ainda.<br><br><button class="btn" data-goto="lancar">Começar a lançar</button></div>';
  const dup=mapaDup(); const nDup=entries.filter(e=>dup[chaveDup(e)]>1).length;
  const datas=[...new Set(entries.map(e=>e.data))].sort();
  let h='<div class="card stack"><div><b>'+entries.length+'</b> lançamento(s) · '+(datas.length>1?'datas':'data')+': <b>'+datas.map(d=>diaSemana(d).slice(0,3)+' '+fmtData(d)).join(', ')+'</b></div>';
  h+='<div class="row"><button class="btn sec" data-act="dataTodos">Alterar data de todos</button></div>';
  if(nDup) h+='<button class="btn sec" data-act="soDup">'+(soDup?'Mostrar todos':'⚠ Ver possíveis duplicidades ('+nDup+')')+'</button>';
  h+='</div>';
  const lista=entries.filter(e=>!soDup || dup[chaveDup(e)]>1).slice();
  const ordS=s=>{ const i=CAD.setores.indexOf(s); return i<0?999:i; }, ordT=t=>{ const i=CAD.turnos.indexOf(t); return i<0?9:i; };
  lista.sort((a,b)=>a.data.localeCompare(b.data)||ordS(a.setor)-ordS(b.setor)||ordT(a.turno)-ordT(b.turno)||a.criadoEm-b.criadoEm);
  let g='';
  for(const e of lista){
    const gk=(datas.length>1?diaSemana(e.data).slice(0,3)+' '+fmtData(e.data)+' · ':'')+e.setor+' · '+e.turno;
    if(gk!==g){ h+='<div class="group">'+esc(gk)+'</div>'; g=gk; }
    const isDup=dup[chaveDup(e)]>1, kg=kgDe(e), tipo=tipoDe(e);
    h+='<button class="entry'+(isDup?' dup':'')+'" data-edit="'+e.id+'"><div class="top"><div class="name">'+esc(e.produto)+'</div><div class="qty">'+fmtNum(e.qtde,0)+'</div></div><div class="meta">'+
      (kg!=null?'<span>'+fmtNum(kg,1)+' kg</span>':'<span>sem peso</span>')+(tipo?'<span class="badge b-info">'+esc(tipo)+'</span>':'')+
      (isDup?'<span class="badge b-warn">possível duplicidade</span>':'')+(foraDaLista(e.setor,e.produto)?'<span class="badge b-info">fora da lista</span>':'')+
      (e.data!==meta.dataLev?'<span class="badge b-info">'+fmtData(e.data)+'</span>':'')+'</div>'+
      (e.obs?'<div class="obs">Obs.: '+esc(e.obs)+'</div>':'')+'</button>';
  }
  return h;
}

function telaExportar(){
  const n=entries.length, nObs=entries.filter(e=>e.obs||foraDaLista(e.setor,e.produto)).length;
  let h='<div class="card stack"><div><b>'+n+'</b> lançamento(s) prontos para exportar.</div>'+
    '<div class="muted">Colunas: '+CABECALHO.join(' · ')+'</div>';
  if(nObs) h+='<div class="muted">'+nObs+' lançamento(s) com observação ou item fora da lista: no Excel eles aparecem também na aba “Observações” (a aba “Lançamentos” continua com as 8 colunas).</div>';
  h+='<button class="btn" data-act="xlsx" '+(n?'':'disabled')+'>⬇ Baixar Excel (.xlsx)</button>'+
     '<button class="btn sec" data-act="csv" '+(n?'':'disabled')+'>⬇ Baixar CSV (.csv)</button>';
  if(navigator.canShare) h+='<button class="btn sec" data-act="share" '+(n?'':'disabled')+'>Compartilhar Excel…</button>';
  if(meta.ultimoExport) h+='<div class="muted">Último arquivo gerado: '+new Date(meta.ultimoExport).toLocaleString('pt-BR')+(meta.alteradoAposExport?' — <b>houve alterações depois disso</b>':'')+'</div>';
  h+='</div>';
  const podeConcluir = n && meta.ultimoExport && !meta.alteradoAposExport;
  h+='<div class="card stack" style="margin-top:12px"><b>Concluir levantamento</b><div class="muted">Apaga os lançamentos deste aparelho para começar um novo levantamento. Só fica liberado depois de exportar, e só se nada mudou desde a exportação.</div>'+
     '<button class="btn danger" data-act="concluir" '+(podeConcluir?'':'disabled')+'>Concluir e limpar</button></div>';
  h+='<div class="card stack" style="margin-top:12px"><b>Segurança e cadastro</b>'+
     '<button class="btn sec" data-act="backup" '+(n?'':'disabled')+'>Baixar backup (.json)</button>'+
     '<button class="btn sec" data-act="restaurar">Restaurar backup…</button>'+
     '<button class="btn sec" data-act="cadastro">Atualizar cadastro pela planilha…</button>'+
     '<div class="muted">Cadastro em uso: '+esc(CAD.origem||'')+(CAD.atualizadoEm?' (atualizado em '+new Date(CAD.atualizadoEm).toLocaleString('pt-BR')+')':' (versão embutida)')+' · '+CAD.setores.length+' setores · '+Object.keys(CAD.peso).length+' pesos · app v'+VERSAO+'</div>'+
     '<input type="file" id="fBackup" accept=".json,application/json" hidden><input type="file" id="fCad" accept=".xlsx,.xlsm" hidden></div>';
  return h;
}

/* ---------- eventos ---------- */
function ligar(v){
  v.querySelectorAll('[data-setor]').forEach(b=>b.onclick=()=>{ meta.setor=b.dataset.setor; meta.turno=null; busca=''; salvarMeta(); render(); scrollTo(0,0); });
  v.querySelectorAll('[data-turno]').forEach(b=>b.onclick=()=>{ meta.turno=b.dataset.turno; busca=''; salvarMeta(); render(); scrollTo(0,0); });
  v.querySelectorAll('[data-prod]').forEach(b=>b.onclick=()=>sheetQtde(b.dataset.prod));
  v.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>sheetEditar(b.dataset.edit));
  v.querySelectorAll('[data-goto]').forEach(b=>b.onclick=()=>{ tab=b.dataset.goto; render(); });
  const bs=$('#busca',v); if(bs) bs.oninput=()=>{ busca=bs.value; const q=norm(busca); v.querySelectorAll('#lista [data-prod]').forEach(b=>b.hidden=!!q && !b.dataset.search.includes(q)); };
  if(bs && busca) bs.oninput();
  v.querySelectorAll('[data-act]').forEach(b=>b.onclick=()=>acoes[b.dataset.act]());
  const fb=$('#fBackup',v); if(fb) fb.onchange=()=>restaurarBackup(fb.files[0]);
  const fc=$('#fCad',v); if(fc) fc.onchange=()=>importarCadastro(fc.files[0]);
}
const acoes={
  trocaSetor(){ meta.setor=null; meta.turno=null; busca=''; salvarMeta(); render(); },
  trocaTurno(){ meta.turno=null; busca=''; salvarMeta(); render(); },
  outro(){ sheetOutro(meta.setor, p=>sheetQtde(p)); },
  soDup(){ soDup=!soDup; render(); },
  dataTodos(){ sheetDataTodos(); },
  xlsx(){ exportar('xlsx'); }, csv(){ exportar('csv'); }, share(){ exportar('xlsx',true); },
  backup(){ baixar(new Blob([JSON.stringify({app:'lancamentos-pcp',versao:VERSAO,geradoEm:new Date().toISOString(),meta,entries},null,1)],{type:'application/json'}), 'Backup_Lancamentos_'+meta.dataLev+'_'+horaArq()+'.json'); },
  restaurar(){ $('#fBackup').click(); },
  cadastro(){ $('#fCad').click(); },
  concluir(){ confirmar('Apagar os '+entries.length+' lançamentos deste aparelho? Confirme que o arquivo exportado foi aberto e está correto.','Sim, concluir e limpar', async()=>{
    entries=[]; meta.ultimoExport=null; meta.alteradoAposExport=false; meta.setor=null; meta.turno=null; meta.dataLev=ontem(); await salvarTudo(); tab='lancar'; render(); toast('Levantamento concluído. Pronto para um novo.'); }); },
};
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{ tab=b.dataset.tab; soDup=false; render(); scrollTo(0,0); });
$('#dataLev').onchange=ev=>{ const nv=ev.target.value; if(!nv){ ev.target.value=meta.dataLev; return; }
  const antiga=meta.dataLev; const nAnt=entries.filter(e=>e.data===antiga).length;
  meta.dataLev=nv; salvarMeta();
  if(nAnt) abrirSheet('<h3>Data alterada para '+fmtData(nv)+'</h3><p class="muted">Existem '+nAnt+' lançamento(s) com a data '+fmtData(antiga)+'. O que fazer com eles?</p><div class="stack"><button class="btn" id="sNovos">Manter '+fmtData(antiga)+' neles — a nova data vale só para os próximos</button><button class="btn sec" id="sTodos">Mudar todos para '+fmtData(nv)+'</button></div>',s=>{
    $('#sTodos',s).onclick=async()=>{ for(const e of entries) if(e.data===antiga){ e.data=nv; } marcarAlterado(); await salvarTudo(); fecharSheet(); render(); toast('Data aplicada a todos'); };
    $('#sNovos',s).onclick=()=>{ fecharSheet(); render(); }; });
  else render(); };
window.addEventListener('online',render); window.addEventListener('offline',render);

function marcarAlterado(){ if(meta.ultimoExport) meta.alteradoAposExport=true; }

function confirmar(msg,ok,fn){ abrirSheet('<h3>Confirmar</h3><p>'+esc(msg)+'</p><div class="stack"><button class="btn danger" id="cOk">'+esc(ok)+'</button><button class="btn sec" id="cNo">Cancelar</button></div>',s=>{
  $('#cOk',s).onclick=async()=>{ fecharSheet(); await fn(); }; $('#cNo',s).onclick=fecharSheet; }); }

/* ---------- lançamento ---------- */
function sheetQtde(produto){
  const {setor,turno}=meta;
  const ja=entries.filter(e=>e.setor===setor && e.turno===turno && e.data===meta.dataLev && norm(e.produto)===norm(produto));
  const fora=foraDaLista(setor,produto); const p=pesoDe(produto);
  abrirSheet('<h3>'+esc(produto)+'</h3><div class="muted">'+esc(setor)+' · '+esc(turno)+' · '+fmtData(meta.dataLev)+(fora?' · <span class="badge b-info">fora da lista do setor</span>':'')+(p?'':' · sem peso cadastrado')+'</div>'+
    (ja.length?'<div class="notice" style="margin:10px 0 0">Já lançado neste setor/turno: '+ja.map(e=>fmtNum(e.qtde,0)).join(' + ')+'. Se salvar, entra como novo registro.</div>':'')+
    '<label class="f" for="q">Quantidade (caixas)</label><input class="qty-in" id="q" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" enterkeyhint="done">'+
    '<button class="link" id="tObs">＋ Observação</button><textarea class="field" id="obs" hidden placeholder="Observação (opcional)"></textarea>'+
    '<div class="row" style="margin-top:12px"><button class="btn sec" id="cancel">Cancelar</button><button class="btn ok" id="save">Salvar</button></div>', s=>{
      const q=$('#q',s), obs=$('#obs',s); setTimeout(()=>q.focus(),50);
      q.addEventListener('input',()=>{ q.value=q.value.replace(/\D/g,''); });
      $('#tObs',s).onclick=()=>{ obs.hidden=false; $('#tObs',s).hidden=true; obs.focus(); };
      $('#cancel',s).onclick=fecharSheet;
      const salvar=async()=>{ const n=parseInt(q.value,10);
        if(!Number.isFinite(n) || n<=0){ toast('Informe uma quantidade maior que zero',true); q.focus(); return; }
        const e={id:uid(), data:meta.dataLev, setor, turno, produto, qtde:n, obs:obs.value.trim(), criadoEm:Date.now()};
        try{ entries.push(e); marcarAlterado(); await salvarEntry(e); await salvarMeta(); pedirPersistencia(); }
        catch(err){ toast('ERRO ao salvar: '+err.message,true); return; }
        fecharSheet(); render(); toast('Salvo: '+fmtNum(n,0)+' — '+produto); };
      $('#save',s).onclick=salvar; q.addEventListener('keydown',ev=>{ if(ev.key==='Enter'){ ev.preventDefault(); salvar(); } });
    });
}

function sheetOutro(setor,onPick){
  const doSetor=new Set((CAD.porSetor[setor]||[]).map(norm));
  const cat=CAD.catalogo.filter(p=>!doSetor.has(norm(p)));
  abrirSheet('<h3>Outro item</h3><div class="muted">Busque no cadastro completo ou digite um nome novo.</div>'+
    '<input class="search" id="ob" type="search" placeholder="Digite parte do nome…" autocomplete="off" style="margin-top:10px"><div class="list" id="ol"></div>'+
    '<button class="btn sec" id="oc" style="margin-top:12px">Cancelar</button>', s=>{
      const ob=$('#ob',s), ol=$('#ol',s);
      const desenhar=()=>{ const q=norm(ob.value); const termos=q.split(/\s+/).filter(Boolean);
        const res=cat.filter(p=>termos.every(t=>norm(p).includes(t))).slice(0,40);
        let h=res.map(p=>'<button class="prod" data-p="'+esc(p)+'"><span>'+esc(p)+'</span></button>').join('');
        if(q && !CAD.catalogo.some(p=>norm(p)===q)) h='<button class="prod other" data-p="'+esc(q)+'">Usar texto digitado: “'+esc(q)+'”</button>'+h;
        if(!h) h='<div class="muted">Nenhum item encontrado.</div>';
        ol.innerHTML=h; ol.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{ fecharSheet(); onPick(b.dataset.p); }); };
      ob.oninput=desenhar; desenhar(); setTimeout(()=>ob.focus(),50); $('#oc',s).onclick=fecharSheet; });
}

/* ---------- revisão / edição ---------- */
function opcoes(lista,sel){ return lista.map(x=>'<option'+(x===sel?' selected':'')+'>'+esc(x)+'</option>').join(''); }
function sheetEditar(id){
  const e=entries.find(x=>x.id===id); if(!e) return;
  const d={...e};
  const montar=()=>{
    const prods=(CAD.porSetor[d.setor]||[]).slice(); if(!prods.some(p=>norm(p)===norm(d.produto))) prods.unshift(d.produto);
    abrirSheet('<h3>Editar lançamento</h3>'+
      '<label class="f">Data</label><input class="field" type="date" id="eD" value="'+d.data+'">'+
      '<div class="row"><div><label class="f">Setor</label><select class="field" id="eS">'+opcoes(CAD.setores.includes(d.setor)?CAD.setores:[d.setor,...CAD.setores],d.setor)+'</select></div>'+
      '<div><label class="f">Turno</label><select class="field" id="eT">'+opcoes(CAD.turnos,d.turno)+'</select></div></div>'+
      '<label class="f">Produto</label><select class="field" id="eP">'+opcoes(prods,d.produto)+'</select><button class="link" id="eOutro">Escolher outro item…</button>'+
      (foraDaLista(d.setor,d.produto)?'<div><span class="badge b-info">fora da lista do setor</span></div>':'')+
      '<label class="f">Quantidade (caixas)</label><input class="field" id="eQ" type="text" inputmode="numeric" value="'+d.qtde+'" style="font-size:22px;font-weight:700">'+
      '<label class="f">Observação</label><textarea class="field" id="eO">'+esc(d.obs||'')+'</textarea>'+
      '<div class="row" style="margin-top:14px"><button class="btn sec" id="eC">Cancelar</button><button class="btn ok" id="eSv">Salvar</button></div>'+
      '<button class="btn danger" id="eX" style="margin-top:10px">Excluir lançamento</button>', s=>{
        const ler=()=>{ d.data=$('#eD',s).value||d.data; d.setor=$('#eS',s).value; d.turno=$('#eT',s).value; d.produto=$('#eP',s).value; d.qtde=$('#eQ',s).value; d.obs=$('#eO',s).value; };
        $('#eQ',s).oninput=ev=>ev.target.value=ev.target.value.replace(/\D/g,'');
        $('#eS',s).onchange=()=>{ ler(); const lst=CAD.porSetor[d.setor]||[]; if(!lst.some(p=>norm(p)===norm(d.produto))) d.produto=lst[0]||d.produto; montar(); };
        $('#eOutro',s).onclick=()=>{ ler(); sheetOutro(d.setor,p=>{ d.produto=p; montar(); }); };
        $('#eC',s).onclick=fecharSheet;
        $('#eSv',s).onclick=async()=>{ ler(); const n=parseInt(d.qtde,10); if(!Number.isFinite(n)||n<=0){ toast('Quantidade inválida',true); return; }
          Object.assign(e,{data:d.data,setor:d.setor,turno:d.turno,produto:d.produto,qtde:n,obs:d.obs.trim()}); marcarAlterado();
          try{ await salvarEntry(e); await salvarMeta(); }catch(err){ toast('ERRO ao salvar: '+err.message,true); return; }
          fecharSheet(); render(); toast('Alteração salva'); };
        $('#eX',s).onclick=()=>confirmar('Excluir “'+e.produto+'” ('+e.qtde+')?','Sim, excluir',async()=>{
          entries=entries.filter(x=>x.id!==e.id); marcarAlterado(); await apagarEntry(e.id); await salvarMeta(); render(); toast('Lançamento excluído'); });
      });
  };
  montar();
}
function sheetDataTodos(){
  abrirSheet('<h3>Alterar data de todos os lançamentos</h3><label class="f">Nova data</label><input class="field" type="date" id="nd" value="'+meta.dataLev+'">'+
    '<div class="row" style="margin-top:14px"><button class="btn sec" id="c">Cancelar</button><button class="btn" id="ok">Aplicar a '+entries.length+'</button></div>',s=>{
      $('#c',s).onclick=fecharSheet;
      $('#ok',s).onclick=async()=>{ const v=$('#nd',s).value; if(!v) return; entries.forEach(e=>e.data=v); meta.dataLev=v; marcarAlterado(); await salvarTudo(); fecharSheet(); render(); toast('Data alterada para '+fmtData(v)); }; });
}

/* ---------- exportação ---------- */
function horaArq(){ const d=new Date(); return String(d.getHours()).padStart(2,'0')+String(d.getMinutes()).padStart(2,'0'); }
function ordenadas(){ return entries.slice().sort((a,b)=>a.data.localeCompare(b.data)||a.criadoEm-b.criadoEm); }
function serialExcel(iso){ const [y,m,d]=iso.split('-').map(Number); return Math.round((Date.UTC(y,m-1,d)-Date.UTC(1899,11,30))/86400000); }
function linhas(){ return ordenadas().map(e=>({e, data:e.data, mes:mesDe(e.data), setor:e.setor, produto:e.produto, turno:e.turno, qtde:e.qtde, kg:kgDe(e), tipo:tipoDe(e)})); }

function gerarXlsx(){
  const L=linhas().map(r=>({...r,kg:r.kg==null?null:Math.round(r.kg*1e9)/1e9})); const wb=XLSX.utils.book_new();
  const aoa=[CABECALHO, ...L.map(r=>[null,r.mes,r.setor,r.produto,r.turno,r.qtde,r.kg,r.tipo])];
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  L.forEach((r,i)=>{ const ref='A'+(i+2); ws[ref]={t:'n',v:serialExcel(r.data),z:'dd/mm/yyyy'}; if(r.kg!=null) ws['G'+(i+2)].z='0.0'; });
  ws['!cols']=[{wch:11},{wch:6},{wch:8},{wch:48},{wch:11},{wch:7},{wch:14},{wch:6}];
  XLSX.utils.book_append_sheet(wb,ws,'Lançamentos');
  const obs=L.map((r,i)=>({r,i})).filter(({r})=>r.e.obs||foraDaLista(r.setor,r.produto));
  if(obs.length){
    const o=XLSX.utils.aoa_to_sheet([['Linha na aba Lançamentos','Data','Setor','Produto','Turno','Qtde.','Fora da lista do setor','Observação'],
      ...obs.map(({r,i})=>[i+2,fmtData(r.data),r.setor,r.produto,r.turno,r.qtde,foraDaLista(r.setor,r.produto)?'SIM':'',r.e.obs||''])]);
    o['!cols']=[{wch:10},{wch:11},{wch:8},{wch:48},{wch:11},{wch:7},{wch:10},{wch:50}];
    XLSX.utils.book_append_sheet(wb,o,'Observações');
  }
  const out=XLSX.write(wb,{bookType:'xlsx',type:'array',compression:true});
  return new Blob([out],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function csvCampo(v){ const s=String(v??''); return /[;"\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; }
function gerarCsv(){
  const L=linhas();
  const kgTxt=kg=>kg==null?'':String(Number(kg.toFixed(6))).replace('.',',');
  const rows=[CABECALHO, ...L.map(r=>[fmtData(r.data),r.mes,r.setor,r.produto,r.turno,r.qtde,kgTxt(r.kg),r.tipo||''])];
  return new Blob(['﻿'+rows.map(r=>r.map(csvCampo).join(';')).join('\r\n')+'\r\n'],{type:'text/csv;charset=utf-8'});
}
function baixar(blob,nome){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=nome; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },4000); }
async function exportar(tipo,compartilhar){
  try{
    const nome='Lancamentos_PCP_'+meta.dataLev+'_'+horaArq()+'.'+tipo;
    const blob= tipo==='xlsx'?gerarXlsx():gerarCsv();
    if(compartilhar){ const f=new File([blob],nome,{type:blob.type});
      if(navigator.canShare && navigator.canShare({files:[f]})){ await navigator.share({files:[f],title:nome}); } else { baixar(blob,nome); } }
    else baixar(blob,nome);
    meta.ultimoExport=Date.now(); meta.alteradoAposExport=false; meta.exportCount=(meta.exportCount||0)+1; await salvarMeta(); render();
    toast('Arquivo gerado: '+nome);
  }catch(err){ if(err && err.name==='AbortError') return; toast('Falha na exportação: '+(err.message||err),true); }
}

/* ---------- backup / cadastro ---------- */
async function restaurarBackup(file){ if(!file) return;
  try{ const j=JSON.parse(await file.text()); if(!j || !Array.isArray(j.entries)) throw new Error('arquivo não é um backup deste app');
    const ok=j.entries.every(e=>e.id&&e.data&&e.setor&&e.turno&&e.produto&&Number.isFinite(e.qtde)); if(!ok) throw new Error('backup com registros inválidos');
    const atuais=new Set(entries.map(e=>e.id)); const novos=j.entries.filter(e=>!atuais.has(e.id));
    confirmar('Backup com '+j.entries.length+' lançamento(s); '+novos.length+' ainda não estão no aparelho. Adicionar esses '+novos.length+'?','Adicionar',async()=>{
      entries.push(...novos); entries.sort((a,b)=>a.criadoEm-b.criadoEm); marcarAlterado(); await salvarTudo(); render(); toast(novos.length+' lançamento(s) restaurado(s)'); });
  }catch(err){ toast('Não foi possível ler: '+err.message,true); }
}
async function importarCadastro(file){ if(!file) return;
  try{
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});
    const aba=n=>{ const ws=wb.Sheets[n]; if(!ws) throw new Error('aba “'+n+'” não encontrada'); return XLSX.utils.sheet_to_json(ws,{header:1,blankrows:false,defval:null}); };
    const setores=aba('Setor').slice(1).map(r=>r[0]).filter(Boolean).map(String);
    const porSetor={}; setores.forEach(s=>porSetor[s]=[]);
    for(const r of aba('Dados').slice(1)){ if(r[0]&&r[1]){ const s=String(r[0]),p=String(r[1]); (porSetor[s]=porSetor[s]||[]); if(!porSetor[s].includes(p)) porSetor[s].push(p); } }
    const peso={}; for(const r of aba('Peso Bello').slice(1)){ if(r[0]&&typeof r[1]==='number'&&typeof r[2]==='number') peso[String(r[0])]={qc:r[1],pp:r[2],mp:r[4]?String(r[4]):null}; }
    const cat=new Set(); Object.values(porSetor).forEach(l=>l.forEach(p=>cat.add(p))); Object.keys(peso).forEach(p=>cat.add(p));
    try{ aba('Lançamentos').slice(2).forEach(r=>{ if(r[3]) cat.add(String(r[3])); }); }catch(_){}
    if(!setores.length || !Object.keys(peso).length) throw new Error('cadastro vazio');
    const novo={origem:file.name, atualizadoEm:Date.now(), setores, turnos:CAD.turnos, porSetor, peso, catalogo:[...cat].sort()};
    confirmar('Planilha lida: '+setores.length+' setores, '+Object.values(porSetor).reduce((a,l)=>a+l.length,0)+' produtos por setor, '+Object.keys(peso).length+' pesos. Usar este cadastro?','Usar cadastro',async()=>{
      CAD=novo; reindexPeso(); if(dbOk) await DB.tx('meta','readwrite',s=>s.put({k:'cadastro',v:CAD})); try{ localStorage.setItem('pcp-cadastro',JSON.stringify(CAD)); }catch(_){}
      render(); toast('Cadastro atualizado'); });
  }catch(err){ toast('Não foi possível ler a planilha: '+err.message,true); }
}

/* ---------- início ---------- */
(async()=>{
  await carregar(); render();
  if('serviceWorker' in navigator){ try{ await navigator.serviceWorker.register('sw.js'); }catch(_){} }
})();
