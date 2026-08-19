# Seguridad y privacidad

RemSwitcher procesa credenciales sensibles de Riot exclusivamente en el equipo local.

- No envía cuentas, contraseñas, actividad o perfiles a Internet.
- El renderer nunca recibe contraseñas ni blobs cifrados.
- El proceso principal valida el origen y el contenido de cada llamada IPC.
- Las contraseñas se protegen con DPAPI y quedan ligadas al usuario de Windows.
- El puente nativo recibe las credenciales mediante `stdin` y limpia sus buffers antes de finalizar.
- Los registros tienen rotación, no incluyen secretos y se limitan a diagnóstico local.

Si otra persona tiene control de la misma sesión de Windows, DPAPI no sustituye las medidas de seguridad del sistema. Usa bloqueo de pantalla, contraseña de Windows y MFA en Riot.

RemSwitcher es un proyecto no oficial. No debe utilizarse con cuentas de terceros, cuentas compartidas ni para eludir medidas de seguridad de Riot.
