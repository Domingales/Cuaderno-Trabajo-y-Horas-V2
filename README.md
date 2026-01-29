# Cuaderno de Mantenimiento (v6 móvil)

App HTML/JS/CSS lista para móvil (Cordova/WebView o navegador).

## Páginas (barra inferior)
- **Registros**: lista, búsqueda, filtro de pendientes, editar/borrar, KPIs.
- **Nuevo**: formulario completo con materiales y trabajos múltiples (+/-).
- **Horas extra**: Total horas extra (automático), Total horas cobradas (manual), Balance (automático).
- **Backup**: Exportar/Importar JSON, Copiar backup al portapapeles y Restaurar pegando.
- **Ajustes**: info.

## Datos (localStorage)
- `mantenimiento_registros_v1` (registros normalizados)
- `mantenimiento_trabajos_v1` (compatibilidad con versiones anteriores)
- `mantenimiento_extra_pagos_v1` (pagos de horas cobradas)

## Cómo ejecutar
Abre `index.html` en el navegador o dentro de tu WebView/Cordova.

## Nota
La restauración por “Pegar / Restaurar” acepta:
- JSON de backup (formato `storage` o `data`)
- Tabla copiada desde Excel (TSV) si incluye cabeceras tipo “Fecha”, “Empresa”, etc.
