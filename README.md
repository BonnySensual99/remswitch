# RemSwitcher 1.0.1

RemSwitcher es un gestor local y privado de cuentas de Riot para Windows 10/11 x64. Permite guardar cuentas cifradas con Windows DPAPI, cambiar de sesión y abrir Valorant o League of Legends.

## Privacidad y uso

- Las cuentas, preferencias y actividad permanecen en `%LOCALAPPDATA%\RemSwitcher`.
- Las contraseñas se cifran con la cuenta actual de Windows mediante Electron `safeStorage`/DPAPI.
- No existe telemetría, sincronización ni servicio en la nube.
- La contraseña se entrega al puente nativo mediante una tubería privada, nunca como argumento del proceso.
- Si Riot Client está abierto con una sesión activa, el cambio solicita el cierre de sesión local antes de reiniciar el cliente; si Riot no confirma ese cierre, la operación se detiene y pide hacerlo manualmente.
- El estado `Sesión en este equipo` indica la sesión detectada en el Riot Client local; `Juego abierto` identifica procesos locales de Valorant o LoL. No se presenta como presencia global de la cuenta.
- Utiliza únicamente cuentas propias. RemSwitcher es un proyecto no oficial y Riot Games no lo patrocina ni respalda.

La automatización del cliente puede dejar de funcionar tras actualizaciones de Riot y puede estar sujeta a sus términos. El usuario acepta este riesgo al utilizar la aplicación.

## Desarrollo

Requisitos:

- Windows 10 u 11 x64.
- Node.js y npm.
- Visual Studio 2022 Build Tools con C++.
- Qt 6 para MSVC 2022 x64 instalado en `C:\Qt`, o la variable `Qt6_DIR` configurada.

```powershell
npm install
npm test
npm run test:electron
npm start
```

## Compilación de la versión privada

```powershell
npm run release
```

El proceso compila el puente desde cero, despliega solo sus dependencias Qt, crea instalador NSIS por usuario y portable x64, y genera `release\SHA256SUMS.txt`.

Después de compilar también puedes ejecutar `npm run test:packaged` para arrancar la versión empaquetada y comprobar la precarga y los botones principales.

Windows puede mostrar SmartScreen porque esta versión privada no está firmada. El instalador no requiere privilegios de administrador y la desinstalación conserva los datos locales.

La matriz de pruebas manuales está en [MANUAL_TEST_MATRIX.md](MANUAL_TEST_MATRIX.md). Los casos que requieren Riot Client deben ejecutarse con cuentas propias; las pruebas automatizadas no sustituyen esa validación.

## Actualización desde versiones anteriores

En el primer arranque se importa `%LOCALAPPDATA%\ValorantAccountManager\accounts.json`, se conserva su cifrado DPAPI y se guarda una copia en `%LOCALAPPDATA%\RemSwitcher\legacy-accounts.backup.json`.
