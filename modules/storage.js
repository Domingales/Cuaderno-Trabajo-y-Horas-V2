/* modules/storage.js */
(function(){
  "use strict";
  const KEY_REGISTROS = "mantenimiento_registros_v1";
  const KEY_OLD_TRABAJOS = "mantenimiento_trabajos_v1";
  const KEY_EXTRA_PAGOS = "mantenimiento_extra_pagos_v1";

  function safeJSONParse(s, def){ try{ return JSON.parse(s); }catch(_){ return def; } }

  function newId(){
    const d = new Date();
    const pad = (n)=>String(n).padStart(2,"0");
    const s = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    return "R" + s + "_" + Math.random().toString(16).slice(2,8).toUpperCase();
  }

  function normalizeRegistro(r){
    const o = Object.assign({}, r||{});

    // Compatibilidad: registros antiguos del asistente (centro/tipo/horas)
    if((o.empresa==null && o.localidad==null) && (o.centro || o.tipo)){
      const c = String(o.centro||"").split(" - ");
      o.empresa = o.empresa || (c.length>1 ? c[0] : "");
      o.localidad = o.localidad || (c.length>1 ? c.slice(1).join(" - ") : (o.centro||""));
      o.ubicacion = o.ubicacion || o.tipo || "";
      o.horaInicio = o.horaInicio || o.hora || "";
      o.horaFin = o.horaFin || "";
      o.descanso = o.descanso || "00:00";
      o.horasLegales = Number.isFinite(Number(o.horasLegales)) ? Number(o.horasLegales) : 8;
      o.horasTrabajadas = Number.isFinite(Number(o.horasTrabajadas)) ? Number(o.horasTrabajadas) : Number(o.horas||0);
      o.horasExtra = Number.isFinite(Number(o.horasExtra)) ? Number(o.horasExtra) : Math.max(0, (Number(o.horasTrabajadas)||0) - (Number(o.horasLegales)||8));
    // --- Normalización nueva (materiales por trabajo completado)
    function normMat(x){
      const nombre = String(x?.nombre || "").trim();
      const cantidad = (x?.cantidad==null ? "" : String(x.cantidad)).trim();
      if(!nombre && !cantidad) return null;
      return { nombre, cantidad };
    }
    function normTrabajoComp(it){
      if(typeof it==="string") return { texto: it.trim(), materiales: [] };
      if(it && typeof it==="object"){
        const texto = String(it.texto ?? it.text ?? it.trabajo ?? it.descripcion ?? "").trim();
        const mats = Array.isArray(it.materiales) ? it.materiales.map(normMat).filter(Boolean) : [];
        return { texto, materiales: mats };
      }
      return { texto: "", materiales: [] };
    }

    const legacyMats = Array.isArray(o.materiales) ? o.materiales.map(normMat).filter(Boolean) : [];
    o.trabajosCompletados = Array.isArray(o.trabajosCompletados) ? o.trabajosCompletados.map(normTrabajoComp) : [];
    o.trabajosPendientes = Array.isArray(o.trabajosPendientes) ? o.trabajosPendientes.map(s=>String(s||"").trim()).filter(Boolean) : [];

    // Si viene de versiones antiguas con materiales "globales", los asignamos al primer trabajo completado
    if(legacyMats.length){
      if(o.trabajosCompletados.length){
        o.trabajosCompletados[0].materiales = [...legacyMats, ...(o.trabajosCompletados[0].materiales||[])];
      }else{
        o.trabajosCompletados = [{ texto: "(materiales sin trabajo)", materiales: legacyMats }];
      }
    }

    // Mantener compatibilidad: o.materiales sigue existiendo como agregado de todos los trabajos completados
    o.materiales = (o.trabajosCompletados||[])
      .flatMap(t=>Array.isArray(t?.materiales) ? t.materiales : [])
      .map(normMat)
      .filter(Boolean);
o.observaciones = o.observaciones || o.descripcion || "";
    }

    o.materiales = Array.isArray(o.materiales) ? o.materiales : [];
    o.trabajosCompletados = Array.isArray(o.trabajosCompletados) ? o.trabajosCompletados : [];
    o.trabajosPendientes = Array.isArray(o.trabajosPendientes) ? o.trabajosPendientes : [];

    o.id = String(o.id || newId());
    o.fecha = String(o.fecha || new Date().toISOString().slice(0,10));
    o.empresa = String(o.empresa || "");
    o.localidad = String(o.localidad || "");
    o.ubicacion = String(o.ubicacion || "");
    o.horaInicio = String(o.horaInicio || "");
    o.horaFin = String(o.horaFin || "");
    o.descanso = String(o.descanso || "00:00");

    o.horasLegales = Number.isFinite(Number(o.horasLegales)) ? Number(o.horasLegales) : 8;
    if(o.horasLegales < 0) o.horasLegales = 0;
    o.horasTrabajadas = Number.isFinite(Number(o.horasTrabajadas)) ? Number(o.horasTrabajadas) : 0;
    // Horas extra siempre se recalculan: todo lo que exceda las horas de convenio (si es 0, todas son extras)
    o.horasExtra = Math.max(0, (Number(o.horasTrabajadas)||0) - (Number(o.horasLegales)||0));

    o.observaciones = String(o.observaciones || "");
    o.createdAt = String(o.createdAt || new Date().toISOString());
    return o;
  }

  function loadRegistros(){
    const raw = localStorage.getItem(KEY_REGISTROS);
    let arr = safeJSONParse(raw, null);

    if(!Array.isArray(arr)){
      const oldRaw = localStorage.getItem(KEY_OLD_TRABAJOS);
      const oldArr = safeJSONParse(oldRaw, []);
      if(Array.isArray(oldArr) && oldArr.length){
        arr = oldArr.map(normalizeRegistro);
        saveRegistros(arr);
      }else{
        arr = [];
      }
    }

    return arr.map(normalizeRegistro);
  }

  function saveRegistros(arr){
    const a = (arr||[]).map(normalizeRegistro);
    localStorage.setItem(KEY_REGISTROS, JSON.stringify(a));
    // compat mínima
    localStorage.setItem(KEY_OLD_TRABAJOS, JSON.stringify(a));
  }

  function addRegistro(r){
    const arr = loadRegistros();
    arr.unshift(normalizeRegistro(r));
    saveRegistros(arr);
    return arr[0];
  }

  function updateRegistro(id, patch){
    const arr = loadRegistros();
    const i = arr.findIndex(x=>x && x.id===id);
    if(i<0) return false;
    arr[i] = normalizeRegistro(Object.assign({}, arr[i], patch));
    saveRegistros(arr);
    return true;
  }

  function deleteRegistro(id){
    const arr = loadRegistros();
    const n = arr.filter(x=>x && x.id!==id);
    saveRegistros(n);
    return n.length !== arr.length;
  }

  function clearRegistros(){
    saveRegistros([]);
  }

  // --- Pagos horas extra
  function loadPagos(){
    const raw = localStorage.getItem(KEY_EXTRA_PAGOS);
    const arr = safeJSONParse(raw, []);
    return Array.isArray(arr) ? arr : [];
  }

  function savePagos(arr){
    localStorage.setItem(KEY_EXTRA_PAGOS, JSON.stringify(arr||[]));
  }

  function addPago(p){
    const arr = loadPagos();
    const o = Object.assign({
      id: newId(),
      fecha: new Date().toISOString().slice(0,10),
      horas: 0,
      nota: "",
      createdAt: new Date().toISOString()
    }, p||{});
    arr.unshift(o);
    savePagos(arr);
    return o;
  }

  function deletePago(id){
    const arr = loadPagos();
    const n = arr.filter(x=>x && x.id!==id);
    savePagos(n);
    return n.length !== arr.length;
  }

  window.StorageMT = {
    KEY_REGISTROS, KEY_OLD_TRABAJOS, KEY_EXTRA_PAGOS,
    newId,
    normalizeRegistro,
    loadRegistros, saveRegistros,
    addRegistro, updateRegistro, deleteRegistro, clearRegistros,
    loadPagos, savePagos, addPago, deletePago
  };
})();
