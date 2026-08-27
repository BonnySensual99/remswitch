<div align="center">
  <img src="./build/icon.png" width="128" alt="RemSwitcher Logo">
  <h1>RemSwitcher</h1>
  <p>El gestor definitivo de cuentas de Riot Games para Windows.</p>
</div>

**RemSwitcher** (anteriormente *ValorantAccountManager*) es una utilidad local ultrarrápida para gestionar, guardar y cambiar entre cuentas de **VALORANT** y **League of Legends** con un solo clic.

---

## 🚀 Características Principales

*   **⚡ Cambio Rápido en 1 Clic:** Pasa de tu cuenta principal a tu smurf en segundos sin tener que escribir correos ni contraseñas manualmente.
*   **🛡️ Cifrado DPAPI Nativo:** Tus contraseñas están doblemente seguras. Se guardan encriptadas localmente utilizando el sistema seguro de Windows (DPAPI) asociado a tu usuario de PC.
*   **⌨️ Atajo Global In-Game:** Pulsa `Alt + R` (o el atajo que tú elijas) desde cualquier juego o aplicación para que aparezca RemSwitcher al instante por encima de todo.
*   **🎨 Diseño Premium Personalizable:** Interfaz moderna y fluida estilo "dark mode" con esquemas de colores intercambiables (Rojo, Azul, Morado, Verde...), avatares de agentes/campeones y efectos translúcidos.
*   **⭐ Favoritos y Perfiles:** Marca tus cuentas más usadas con la estrella dorada para fijarlas arriba del todo, y organízalas mediante el sistema de Perfiles (por ejemplo: "Cuentas EUW", "Smurfs Valorant", etc).
*   **⚙️ Inteligente y Silencioso:** Se minimiza a la bandeja del sistema, puede cerrar el juego actual automáticamente al cambiar de cuenta, y tiene opciones avanzadas para ajustar los milisegundos de inyección en PCs lentos.
*   **🤖 Autocompletado de Rango:** Si tienes el Riot Client abierto, la app es capaz de extraer automáticamente tu Riot ID, nivel y rango competitivo con un clic al registrar la cuenta.

## 🛠️ Instalación y Uso

RemSwitcher no requiere conexión a la nube. Todo vive en tu PC (`%LOCALAPPDATA%\RemSwitcher`).

Si descargas el código fuente y quieres compilarlo:
1. Asegúrate de tener instalado **Node.js**, **npm** y las herramientas de compilación de **C++ / Qt6**.
2. Instala dependencias: `npm install`
3. Compila el ejecutable: `npm run release`
4. Encontrarás el instalador (Setup) y la versión portable en la carpeta `release/`.

> **Nota de seguridad de Windows:** Como es una herramienta de uso privado y el `.exe` no tiene una firma digital empresarial, Windows SmartScreen puede avisarte la primera vez que lo abras. Es totalmente normal. Simplemente dale a "Más información" -> "Ejecutar de todas formas".

## 🔒 Privacidad 100% Garantizada

*   No existe telemetría.
*   No hay servidores externos. Todo se guarda localmente en tu ordenador.
*   Tus contraseñas se entregan directamente al cliente oficial de Riot a través de un puente nativo a bajo nivel, nunca como argumento ni en texto plano.

## ⚠️ Disclaimer

*Utiliza únicamente cuentas propias. RemSwitcher es un proyecto no oficial de código abierto y Riot Games no lo patrocina, respalda, ni tiene relación con él.*
