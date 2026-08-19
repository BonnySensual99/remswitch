#include "RiotManager.h"

#include <QThread>
#include <QStringList>
#include <UIAutomation.h>
#include <oleauto.h>

namespace {
BOOL CALLBACK findRiotWindowCallback(HWND hwnd, LPARAM parameter) {
    if (!IsWindowVisible(hwnd)) return TRUE;
    wchar_t title[512] = {};
    GetWindowTextW(hwnd, title, 512);
    const QString windowTitle = QString::fromWCharArray(title);
    if (windowTitle.contains("Riot Client", Qt::CaseInsensitive)) {
        *reinterpret_cast<HWND*>(parameter) = hwnd;
        return FALSE;
    }
    return TRUE;
}

bool sendKey(WORD key) {
    INPUT input[2] = {};
    input[0].type = INPUT_KEYBOARD;
    input[0].ki.wVk = key;
    input[1].type = INPUT_KEYBOARD;
    input[1].ki.wVk = key;
    input[1].ki.dwFlags = KEYEVENTF_KEYUP;
    return SendInput(2, input, sizeof(INPUT)) == 2;
}

bool sendUnicodeString(const QString& value, int charDelayMs) {
    for (const QChar character : value) {
        INPUT input[2] = {};
        input[0].type = INPUT_KEYBOARD;
        input[0].ki.wScan = character.unicode();
        input[0].ki.dwFlags = KEYEVENTF_UNICODE;
        input[1].type = INPUT_KEYBOARD;
        input[1].ki.wScan = character.unicode();
        input[1].ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
        if (SendInput(2, input, sizeof(INPUT)) != 2) return false;
        QThread::msleep(static_cast<unsigned long>(charDelayMs));
    }
    return true;
}

bool clearFocusedField() {
    INPUT input[4] = {};
    input[0].type = INPUT_KEYBOARD;
    input[0].ki.wVk = VK_CONTROL;
    input[1].type = INPUT_KEYBOARD;
    input[1].ki.wVk = 'A';
    input[2].type = INPUT_KEYBOARD;
    input[2].ki.wVk = 'A';
    input[2].ki.dwFlags = KEYEVENTF_KEYUP;
    input[3].type = INPUT_KEYBOARD;
    input[3].ki.wVk = VK_CONTROL;
    input[3].ki.dwFlags = KEYEVENTF_KEYUP;
    if (SendInput(4, input, sizeof(INPUT)) != 4) return false;
    QThread::msleep(40);
    return sendKey(VK_BACK);
}

QString currentElementName(IUIAutomationElement* element) {
    if (!element) return {};
    BSTR rawName = nullptr;
    if (FAILED(element->get_CurrentName(&rawName)) || !rawName) return {};
    const QString name = QString::fromWCharArray(rawName);
    SysFreeString(rawName);
    return name;
}

bool isUsableEdit(IUIAutomationElement* element) {
    if (!element) return false;
    BOOL enabled = FALSE;
    BOOL focusable = FALSE;
    element->get_CurrentIsEnabled(&enabled);
    element->get_CurrentIsKeyboardFocusable(&focusable);
    return enabled && focusable;
}

bool containsAuthenticationError(const QString& value) {
    const QString text = value.toLower();
    const QStringList markers = {
        QStringLiteral("incorrect password"), QStringLiteral("wrong password"),
        QStringLiteral("invalid credentials"), QStringLiteral("contraseña incorrecta"),
        QStringLiteral("credenciales incorrectas"), QStringLiteral("incorrecta")
    };
    for (const QString& marker : markers) {
        if (text.contains(marker)) return true;
    }
    return false;
}
}

HWND RiotManager::findRiotClientWindow() const {
    HWND result = nullptr;
    EnumWindows(findRiotWindowCallback, reinterpret_cast<LPARAM>(&result));
    return result;
}

HWND RiotManager::waitForRiotClientWindow(int timeoutMs) const {
    const int attempts = qMax(1, timeoutMs / 100);
    for (int attempt = 0; attempt < attempts; ++attempt) {
        if (HWND hwnd = findRiotClientWindow()) return hwnd;
        QThread::msleep(100);
    }
    return nullptr;
}

bool RiotManager::performLoginAutomation(const QString& username, const QString& password, const AutomationTimings& timings) const {
    HWND hwnd = findRiotClientWindow();
    if (!hwnd) return false;

    ShowWindow(hwnd, SW_RESTORE);
    SetForegroundWindow(hwnd);
    BringWindowToTop(hwnd);
    QThread::msleep(static_cast<unsigned long>(timings.initialDelayMs));

    if (injectCredentialsUIAutomation(hwnd, username, password)) return true;
    SetForegroundWindow(hwnd);
    QThread::msleep(200);
    return injectCredentialsSendInput(hwnd, username, password, timings);
}

bool RiotManager::injectCredentialsUIAutomation(HWND hwnd, const QString& username, const QString& password) const {
    const HRESULT initResult = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    const bool shouldUninitialize = SUCCEEDED(initResult);
    if (FAILED(initResult) && initResult != RPC_E_CHANGED_MODE) return false;

    IUIAutomation* automation = nullptr;
    HRESULT result = CoCreateInstance(CLSID_CUIAutomation, nullptr, CLSCTX_INPROC_SERVER, IID_IUIAutomation, reinterpret_cast<void**>(&automation));
    if (FAILED(result) || !automation) {
        if (shouldUninitialize) CoUninitialize();
        return false;
    }

    IUIAutomationElement* root = nullptr;
    result = automation->ElementFromHandle(hwnd, &root);
    if (FAILED(result) || !root) {
        automation->Release();
        if (shouldUninitialize) CoUninitialize();
        return false;
    }

    VARIANT property;
    VariantInit(&property);
    property.vt = VT_I4;
    property.lVal = UIA_EditControlTypeId;
    IUIAutomationCondition* condition = nullptr;
    automation->CreatePropertyCondition(UIA_ControlTypePropertyId, property, &condition);

    IUIAutomationElementArray* elements = nullptr;
    if (condition) {
        root->FindAll(TreeScope_Descendants, condition, &elements);
        condition->Release();
    }

    bool success = false;
    if (elements) {
        int count = 0;
        elements->get_Length(&count);
        if (count >= 2) {
            IUIAutomationElement* userElement = nullptr;
            IUIAutomationElement* passwordElement = nullptr;
            for (int index = 0; index < count; ++index) {
                IUIAutomationElement* candidate = nullptr;
                elements->GetElement(index, &candidate);
                if (!isUsableEdit(candidate)) {
                    if (candidate) candidate->Release();
                    continue;
                }
                const QString name = currentElementName(candidate).toLower();
                if (!passwordElement && (name.contains("password") || name.contains("contraseña") || name.contains("clave"))) {
                    passwordElement = candidate;
                } else if (!userElement && (name.contains("user") || name.contains("email") || name.contains("usuario") || name.contains("login"))) {
                    userElement = candidate;
                } else if (!userElement) {
                    userElement = candidate;
                } else if (!passwordElement) {
                    passwordElement = candidate;
                } else {
                    candidate->Release();
                }
            }
            if (userElement && passwordElement) {
                IValueProvider* userProvider = nullptr;
                IValueProvider* passwordProvider = nullptr;
                userElement->GetCurrentPattern(UIA_ValuePatternId, reinterpret_cast<IUnknown**>(&userProvider));
                passwordElement->GetCurrentPattern(UIA_ValuePatternId, reinterpret_cast<IUnknown**>(&passwordProvider));
                if (userProvider && passwordProvider) {
                    BSTR userValue = SysAllocStringLen(reinterpret_cast<const OLECHAR*>(username.utf16()), static_cast<UINT>(username.length()));
                    BSTR passwordValue = SysAllocStringLen(reinterpret_cast<const OLECHAR*>(password.utf16()), static_cast<UINT>(password.length()));
                    const HRESULT userResult = userProvider->SetValue(userValue);
                    const HRESULT passwordResult = passwordProvider->SetValue(passwordValue);
                    SecureZeroMemory(passwordValue, password.length() * sizeof(wchar_t));
                    SysFreeString(userValue);
                    SysFreeString(passwordValue);
                    if (SUCCEEDED(userResult) && SUCCEEDED(passwordResult)) {
                        passwordElement->SetFocus();
                        QThread::msleep(100);
                        success = sendKey(VK_RETURN);
                    }
                    userProvider->Release();
                    passwordProvider->Release();
                }
                userElement->Release();
                passwordElement->Release();
            }
        }
        elements->Release();
    }

    root->Release();
    automation->Release();
    if (shouldUninitialize) CoUninitialize();
    return success;
}

bool RiotManager::detectAuthenticationError() const {
    const HWND hwnd = findRiotClientWindow();
    if (!hwnd) return false;
    const HRESULT initResult = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    const bool shouldUninitialize = SUCCEEDED(initResult);
    if (FAILED(initResult) && initResult != RPC_E_CHANGED_MODE) return false;

    IUIAutomation* automation = nullptr;
    if (FAILED(CoCreateInstance(CLSID_CUIAutomation, nullptr, CLSCTX_INPROC_SERVER, IID_IUIAutomation, reinterpret_cast<void**>(&automation))) || !automation) {
        if (shouldUninitialize) CoUninitialize();
        return false;
    }
    IUIAutomationElement* root = nullptr;
    if (FAILED(automation->ElementFromHandle(hwnd, &root)) || !root) {
        automation->Release();
        if (shouldUninitialize) CoUninitialize();
        return false;
    }
    IUIAutomationCondition* condition = nullptr;
    automation->CreateTrueCondition(&condition);
    IUIAutomationElementArray* elements = nullptr;
    if (condition) root->FindAll(TreeScope_Descendants, condition, &elements);
    if (condition) condition->Release();

    bool found = false;
    if (elements) {
        int count = 0;
        elements->get_Length(&count);
        for (int index = 0; index < count && !found; ++index) {
            IUIAutomationElement* element = nullptr;
            elements->GetElement(index, &element);
            if (element) {
                found = containsAuthenticationError(currentElementName(element));
                element->Release();
            }
        }
        elements->Release();
    }
    root->Release();
    automation->Release();
    if (shouldUninitialize) CoUninitialize();
    return found;
}

bool RiotManager::injectCredentialsSendInput(HWND hwnd, const QString& username, const QString& password, const AutomationTimings& timings) const {
    SetForegroundWindow(hwnd);
    QThread::msleep(180);
    if (!clearFocusedField() || !sendUnicodeString(username, timings.charDelayMs)) return false;
    QThread::msleep(static_cast<unsigned long>(timings.fieldDelayMs));
    if (!sendKey(VK_TAB)) return false;
    QThread::msleep(static_cast<unsigned long>(timings.fieldDelayMs));
    if (!clearFocusedField() || !sendUnicodeString(password, timings.charDelayMs)) return false;
    QThread::msleep(static_cast<unsigned long>(timings.fieldDelayMs));
    return sendKey(VK_RETURN);
}
