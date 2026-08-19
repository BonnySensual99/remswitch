#pragma once

#include <QString>
#include <windows.h>

struct AutomationTimings {
    int initialDelayMs = 1800;
    int charDelayMs = 15;
    int fieldDelayMs = 200;
};

class RiotManager {
public:
    HWND waitForRiotClientWindow(int timeoutMs = 25000) const;
    bool performLoginAutomation(const QString& username, const QString& password, const AutomationTimings& timings) const;
    bool detectAuthenticationError() const;

private:
    HWND findRiotClientWindow() const;
    bool injectCredentialsUIAutomation(HWND hwnd, const QString& username, const QString& password) const;
    bool injectCredentialsSendInput(HWND hwnd, const QString& username, const QString& password, const AutomationTimings& timings) const;
};
