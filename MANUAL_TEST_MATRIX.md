# Matriz manual RemSwitcher 1.0.1

Realizar con cuentas propias y sin una partida activa. Marcar cada caso después de observar el estado de la interfaz y comprobar que no aparecen credenciales en procesos, archivos o logs.

| Caso | Preparación | Resultado esperado |
| --- | --- | --- |
| Riot abierto con sesión | Abrir Riot Client y dejar una cuenta autenticada | RemSwitcher muestra la sesión; al iniciar otra cuenta muestra `Cerrando sesión`, confirma el logout y reinicia Riot |
| Logout no confirmado | Interrumpir Riot durante el cierre | Estado `Intervención manual`, botones para abrir Riot y reintentar |
| Riot abierto sin sesión | Cerrar sesión en Riot, mantener el cliente abierto | No intenta logout; continúa con el acceso guardado |
| Valorant | Cuenta marcada como Valorant | Usa `--launch-product=valorant` y registra la actividad solo tras autenticar y lanzar |
| League of Legends | Cuenta marcada como LoL | Usa `--launch-product=league_of_legends` y registra la actividad solo tras autenticar y lanzar |
| MFA | Activar MFA en la cuenta | Estado `Esperando autenticación`; nunca muestra completado antes de confirmar la sesión |
| Contraseña incorrecta | Guardar una contraseña errónea | Estado `Contraseña incorrecta`, sin registrar actividad y con opción de reintentar |
| Cliente ausente | Cambiar temporalmente la ruta o desinstalar Riot | Estado de intervención manual, sin cerrar juegos ni marcar éxito |
| Ruta personalizada | Seleccionar un `RiotClientServices.exe` firmado | Diagnóstico `Cliente firmado`; una ruta no firmada se rechaza |
| Juego ya abierto | Abrir Valorant o LoL antes del cambio | Mensaje para cerrar el juego; no se finaliza ningún proceso de partida |
| Reinicio | Completar un cambio y volver a abrir RemSwitcher | La cuenta, actividad y preferencias se restauran desde el almacenamiento local |
| Teclado y foco | Usar Tab, Shift+Tab, Enter y Escape | El foco queda atrapado en diálogos, Escape cierra y no hay controles inaccesibles |

## Entornos

- Windows 10 x64 limpio.
- Windows 11 x64 limpio.
- Instalador NSIS por usuario.
- Portable x64.

## Evidencias

Guardar únicamente resultados y códigos de estado. No guardar capturas, logs ni exportaciones que contengan nombres de usuario, tokens del lockfile o contraseñas.
