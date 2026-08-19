#include <QCoreApplication>
#include <QFile>
#include <QFileInfo>
#include <QJsonDocument>
#include <QJsonObject>
#include <QTextStream>
#include <windows.h>

#include "RiotManager.h"

namespace {
void clearSecret(QString& value) {
    if (!value.isEmpty()) SecureZeroMemory(const_cast<ushort*>(value.utf16()), value.length() * sizeof(ushort));
    value.clear();
}

void emitState(const QString& state, const QString& message, const QString& errorCode = {}) {
    QJsonObject payload;
    payload["state"] = state;
    payload["message"] = message;
    if (!errorCode.isEmpty()) payload["errorCode"] = errorCode;
    QTextStream output(stdout);
    output << QJsonDocument(payload).toJson(QJsonDocument::Compact) << Qt::endl;
}

int boundedInt(const QJsonObject& object, const char* name, int fallback, int minimum, int maximum) {
    const int value = object.value(name).toInt(fallback);
    return qBound(minimum, value, maximum);
}
}

int main(int argc, char* argv[]) {
    QCoreApplication app(argc, argv);
    if (argc != 1) {
        emitState("Error", "El puente no acepta credenciales por argumentos.", "BRIDGE_ARGUMENTS");
        return 10;
    }

    QFile input;
    if (!input.open(stdin, QIODevice::ReadOnly | QIODevice::Text)) {
        emitState("Error", "No se pudo leer la solicitud segura.", "BRIDGE_INPUT_ERROR");
        return 11;
    }
    QByteArray requestBytes = input.readAll();
    QJsonParseError parseError;
    const QJsonDocument document = QJsonDocument::fromJson(requestBytes, &parseError);
    SecureZeroMemory(requestBytes.data(), static_cast<SIZE_T>(requestBytes.size()));
    requestBytes.clear();
    if (parseError.error != QJsonParseError::NoError || !document.isObject()) {
        emitState("Error", "La solicitud de automatización no es válida.", "BRIDGE_INVALID_JSON");
        return 12;
    }

    const QJsonObject request = document.object();
    QString username = request.value("username").toString();
    QString password = request.value("password").toString();
    const QString riotClientPath = request.value("riotClientPath").toString();
    if (username.isEmpty() || password.isEmpty() || username.length() > 80 || password.length() > 256) {
        emitState("Error", "Faltan credenciales válidas.", "BRIDGE_INVALID_CREDENTIALS");
        clearSecret(username);
        clearSecret(password);
        return 13;
    }
    const QFileInfo riotExecutable(riotClientPath);
    if (!riotExecutable.exists() || riotExecutable.fileName().compare("RiotClientServices.exe", Qt::CaseInsensitive) != 0) {
        emitState("Error", "La ruta de Riot Client no es válida.", "RIOT_PATH_INVALID");
        clearSecret(username);
        clearSecret(password);
        return 14;
    }

    AutomationTimings timings;
    timings.initialDelayMs = boundedInt(request, "initialDelayMs", 1800, 300, 10000);
    timings.charDelayMs = boundedInt(request, "charDelayMs", 15, 1, 100);
    timings.fieldDelayMs = boundedInt(request, "fieldDelayMs", 200, 50, 1000);

    RiotManager manager;
    emitState("WaitingForLoginWindow", "Esperando la ventana de inicio de sesión…");
    if (!manager.waitForRiotClientWindow()) {
        emitState("Error", "No apareció la ventana de inicio de sesión de Riot.", "NO_LOGIN_WINDOW");
        clearSecret(username);
        clearSecret(password);
        return 20;
    }

    emitState("Authenticating", "Introduciendo las credenciales de forma local…");
    const bool success = manager.performLoginAutomation(username, password, timings);
    Sleep(700);
    const bool passwordRejected = success && manager.detectAuthenticationError();
    clearSecret(password);
    clearSecret(username);

    if (passwordRejected) {
        emitState("Error", "Riot rechazó la contraseña. Comprueba las credenciales guardadas.", "PASSWORD_INCORRECT");
        return 22;
    }
    if (!success) {
        emitState("Error", "No se pudieron introducir las credenciales en Riot.", "CREDENTIAL_INPUT_FAILED");
        return 21;
    }
    emitState("CredentialsSubmitted", "Credenciales enviadas. Verificando la sesión…");
    return 0;
}
