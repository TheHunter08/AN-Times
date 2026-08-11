# Times INC — expediente de cumplimiento técnico (España)

Estado: base técnica en implantación. Este documento no sustituye el criterio de la asesoría laboral, el delegado de protección de datos ni la representación legal de los trabajadores.

## Alcance confirmado

- Aplicación interna para una única empresa.
- Registro diario de inicio y fin de jornada.
- Pausas, obra/centro, solicitudes, gastos, documentos y cierres mensuales.
- Geolocalización puntual durante acciones de fichaje; no seguimiento continuo.
- Firma electrónica simple dibujada, acompañada de identidad, fecha y huellas SHA-256. No es firma electrónica cualificada.

## Medidas implantadas en la aplicación

- Conservación funcional de registros de jornada durante un mínimo de cuatro años.
- Historial de correcciones con autor, fecha y motivo.
- Información previa versionada para cada trabajador.
- Evidencia append-only de recepción de la información en `legal_acknowledgements`.
- Identificación configurable del responsable del tratamiento y contacto de derechos.
- Explicación expresa de la geolocalización y de su uso puntual.
- Clasificación correcta de la firma dibujada como firma electrónica simple.
- Hash SHA-256 del documento original y del documento firmado.
- Exportaciones de jornada y panel de cumplimiento.

## Acciones organizativas obligatorias fuera del código

1. Completar en Centro operativo la razón social, CIF/NIF, domicilio y correo de privacidad.
2. Validar la información entregada con la asesoría y con las medidas reales utilizadas.
3. Informar o consultar a la representación de los trabajadores cuando corresponda.
4. Aprobar una política interna de desconexión digital, previa audiencia de la representación de los trabajadores.
5. Documentar el registro de actividades de tratamiento, encargados, plazos y medidas de seguridad.
6. Formalizar contratos de encargado del tratamiento con los proveedores aplicables.
7. Realizar una evaluación de impacto si el análisis de riesgos lo exige. No activar identificación biométrica sin evaluación jurídica y técnica específica.
8. Determinar si la empresa está obligada a disponer de Sistema interno de información conforme a la Ley 2/2023; con carácter general alcanza al sector privado con 50 o más trabajadores, además de determinados sectores con independencia del tamaño.
9. Aplicar y probar todas las migraciones RLS antes de retirar las políticas temporales anónimas.

## Criterios de conservación

- Registros de jornada: mínimo de cuatro años, disponibles para trabajadores, representantes e Inspección de Trabajo.
- Evidencias de corrección, validación y cierre: asociadas al registro durante su periodo de conservación.
- Documentos laborales: plazo definido por categoría y responsabilidad aplicable; no usar una eliminación automática única para todos.
- Auditoría de seguridad: plazo documentado según finalidad y riesgos. La poda general de 30 días no debe eliminar la trazabilidad legal de los registros.

## Fuentes oficiales de referencia

- Estatuto de los Trabajadores, artículo 34.9: https://www.boe.es/buscar/act.php?id=BOE-A-2015-11430
- Ley Orgánica 3/2018, artículos 88 y 90: https://www.boe.es/buscar/act.php?id=BOE-A-2018-16673
- Guía AEPD sobre protección de datos en relaciones laborales: https://www.aepd.es/guias/la-proteccion-de-datos-en-las-relaciones-laborales.pdf
- Guía AEPD sobre control de presencia mediante sistemas biométricos: https://www.aepd.es/guias/guia-control-presencia-biometrico.pdf
- Reglamento eIDAS, artículos 25 y 26: https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX:32014R0910
- Ley 6/2020 de servicios electrónicos de confianza: https://www.boe.es/buscar/act.php?id=BOE-A-2020-14046
- Ley 2/2023 de protección del informante: https://www.boe.es/buscar/act.php?id=BOE-A-2023-4513

## Puerta de salida legal-técnica

### Orden de activación Auth/RLS

1. Mantener temporalmente el modo legacy y abrir todos los dispositivos para vaciar sus colas offline.
2. Ejecutar `npm run audit:launch`, crear un backup y verificar la restauración en seco.
3. Aplicar, en este orden, `migration-2026-08-11-documentos-firma-access.sql`, `migration-2026-08-11-legal-acknowledgements.sql` y `migration-2026-08-11-auth-rls-runtime.sql`.
4. Crear o verificar la identidad Supabase Auth y el correo único de cada persona activa; ninguna puede quedar sin `auth_id`.
5. Repetir la auditoría y observar la paridad entre blob y tablas antes del corte.
6. En ventana de mantenimiento, aplicar `policies_auth.sql`. Este paso archiva y retira los PIN legacy de la tabla accesible a la PWA.
7. Desplegar con `VITE_SECURITY_MODE=auth_rls` y `VITE_SECURITY_ACTIVATION_SEAL=TIMES_INC_AUTH_RLS_2026_08_11`. La caché y la cola offline quedan aisladas por identidad Auth.
8. Probar con cuentas reales de administrador, jefe de obra y empleado: fichaje offline/online, firma, apertura del PDF firmado, corrección, exportación y cierre de sesión en dispositivo compartido.
9. Si alguna prueba crítica falla, retirar el build seguro y ejecutar `policies_auth_rollback.sql`; no borrar tablas ni evidencias durante el rollback.

No publicar como sistema definitivo hasta que se cumplan simultáneamente:

- cero datos laborales accesibles mediante políticas anónimas;
- todos los trabajadores con identidad Auth única;
- información legal configurada y recibida;
- restauración de backup verificada;
- pruebas de fichaje, corrección, exportación y firma en dispositivos reales;
- revisión profesional del expediente y de los textos específicos de la empresa.
