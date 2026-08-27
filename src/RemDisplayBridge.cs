using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

namespace RemDisplayBridge
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct DEVMODE
    {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string dmDeviceName;
        public short dmSpecVersion;
        public short dmDriverVersion;
        public short dmSize;
        public short dmDriverExtra;
        public int dmFields;
        public int dmPositionX;
        public int dmPositionY;
        public int dmDisplayOrientation;
        public int dmDisplayFixedOutput;
        public short dmColor;
        public short dmDuplex;
        public short dmYResolution;
        public short dmTTOption;
        public short dmCollate;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string dmFormName;
        public short dmLogPixels;
        public int dmBitsPerPel;
        public int dmPelsWidth;
        public int dmPelsHeight;
        public int dmDisplayFlags;
        public int dmDisplayFrequency;
        public int dmICMMethod;
        public int dmICMIntent;
        public int dmMediaType;
        public int dmDitherType;
        public int dmReserved1;
        public int dmReserved2;
        public int dmPanningWidth;
        public int dmPanningHeight;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct DISPLAY_DEVICE
    {
        public int cb;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string DeviceName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string DeviceString;
        public int StateFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string DeviceID;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string DeviceKey;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct NV_DISPLAY_DVC_INFO_EX
    {
        public uint version;
        public int currentLevel;
        public int minLevel;
        public int maxLevel;
        public int defaultLevel;
    }

    public class DisplayModeInfo
    {
        public int Width { get; set; }
        public int Height { get; set; }
        public int BitsPerPel { get; set; }
        public int Frequency { get; set; }
    }

    public class DisplayDeviceInfo
    {
        public string Name { get; set; }
        public string DeviceString { get; set; }
        public bool IsPrimary { get; set; }
        public DisplayModeInfo CurrentMode { get; set; }
        public List<int> SupportedFrequencies { get; set; }
        public List<DisplayModeInfo> AvailableModes { get; set; }
        public bool NvidiaSupported { get; set; }
        public int? CurrentVibrance { get; set; }
    }

    public static class NativeMethods
    {
        public const int ENUM_CURRENT_SETTINGS = -1;
        public const int DM_PELSWIDTH = 0x00080000;
        public const int DM_PELSHEIGHT = 0x00100000;
        public const int DM_DISPLAYFREQUENCY = 0x00400000;
        public const int CDS_UPDATEREGISTRY = 0x00000001;
        public const int CDS_TEST = 0x00000002;
        public const int DISP_CHANGE_SUCCESSFUL = 0;
        public const int DISP_CHANGE_RESTART = 1;
        public const int DISPLAY_DEVICE_PRIMARY_DEVICE = 0x00000004;

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        public static extern bool EnumDisplaySettingsW(string lpszDeviceName, int iModeNum, ref DEVMODE lpDevMode);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        public static extern int ChangeDisplaySettingsExW(string lpszDeviceName, ref DEVMODE lpDevMode, IntPtr hwnd, uint dwflags, IntPtr lParam);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        public static extern bool EnumDisplayDevicesW(string lpDevice, uint iDevNum, ref DISPLAY_DEVICE lpDisplayDevice, uint dwFlags);

        [DllImport("kernel32.dll", CharSet = CharSet.Ansi, SetLastError = true)]
        public static extern IntPtr LoadLibrary(string lpFileName);

        [DllImport("kernel32.dll", CharSet = CharSet.Ansi, SetLastError = true)]
        public static extern IntPtr GetProcAddress(IntPtr hModule, string lpProcName);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        public delegate IntPtr NvAPI_QueryInterface_Delegate(uint offset);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        public delegate int NvAPI_Initialize_Delegate();

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        public delegate int NvAPI_EnumNvidiaDisplayHandle_Delegate(uint thisEnum, ref IntPtr pNvDispHandle);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        public delegate int NvAPI_GetAssociatedDisplayName_Delegate(IntPtr pNvDispHandle, byte[] szDisplayName);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        public delegate int NvAPI_GetDVCInfoEx_Delegate(IntPtr pNvDispHandle, uint outputId, ref NV_DISPLAY_DVC_INFO_EX pDVCInfo);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        public delegate int NvAPI_SetDVCLevelEx_Delegate(IntPtr pNvDispHandle, uint outputId, ref NV_DISPLAY_DVC_INFO_EX pDVCInfo);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        public delegate int NvAPI_Unload_Delegate();
    }

    public class NvidiaManager : IDisposable
    {
        private IntPtr _hNvapi;
        private NativeMethods.NvAPI_Initialize_Delegate _nvInit;
        private NativeMethods.NvAPI_EnumNvidiaDisplayHandle_Delegate _nvEnum;
        private NativeMethods.NvAPI_GetAssociatedDisplayName_Delegate _nvName;
        private NativeMethods.NvAPI_GetDVCInfoEx_Delegate _nvGetDvc;
        private NativeMethods.NvAPI_SetDVCLevelEx_Delegate _nvSetDvc;
        private NativeMethods.NvAPI_Unload_Delegate _nvUnload;
        private bool _isInitialized;

        public bool IsAvailable { get { return _isInitialized; } }

        public NvidiaManager()
        {
            try
            {
                _hNvapi = NativeMethods.LoadLibrary(IntPtr.Size == 8 ? "nvapi64.dll" : "nvapi.dll");
                if (_hNvapi == IntPtr.Zero) return;

                IntPtr pQuery = NativeMethods.GetProcAddress(_hNvapi, "nvapi_QueryInterface");
                if (pQuery == IntPtr.Zero) return;

                var query = (NativeMethods.NvAPI_QueryInterface_Delegate)Marshal.GetDelegateForFunctionPointer(pQuery, typeof(NativeMethods.NvAPI_QueryInterface_Delegate));

                IntPtr pInit = query(0x0150E828);
                IntPtr pEnum = query(0x9ABDD40D);
                IntPtr pName = query(0x22A78B05);
                IntPtr pGetDvc = query(0x0E45002D);
                IntPtr pSetDvc = query(0x4A82C2B1);
                IntPtr pUnload = query(0xD22BDD7E);

                if (pInit == IntPtr.Zero || pEnum == IntPtr.Zero || pName == IntPtr.Zero || pGetDvc == IntPtr.Zero || pSetDvc == IntPtr.Zero)
                    return;

                _nvInit = (NativeMethods.NvAPI_Initialize_Delegate)Marshal.GetDelegateForFunctionPointer(pInit, typeof(NativeMethods.NvAPI_Initialize_Delegate));
                _nvEnum = (NativeMethods.NvAPI_EnumNvidiaDisplayHandle_Delegate)Marshal.GetDelegateForFunctionPointer(pEnum, typeof(NativeMethods.NvAPI_EnumNvidiaDisplayHandle_Delegate));
                _nvName = (NativeMethods.NvAPI_GetAssociatedDisplayName_Delegate)Marshal.GetDelegateForFunctionPointer(pName, typeof(NativeMethods.NvAPI_GetAssociatedDisplayName_Delegate));
                _nvGetDvc = (NativeMethods.NvAPI_GetDVCInfoEx_Delegate)Marshal.GetDelegateForFunctionPointer(pGetDvc, typeof(NativeMethods.NvAPI_GetDVCInfoEx_Delegate));
                _nvSetDvc = (NativeMethods.NvAPI_SetDVCLevelEx_Delegate)Marshal.GetDelegateForFunctionPointer(pSetDvc, typeof(NativeMethods.NvAPI_SetDVCLevelEx_Delegate));

                if (pUnload != IntPtr.Zero)
                    _nvUnload = (NativeMethods.NvAPI_Unload_Delegate)Marshal.GetDelegateForFunctionPointer(pUnload, typeof(NativeMethods.NvAPI_Unload_Delegate));

                if (_nvInit() == 0)
                {
                    _isInitialized = true;
                }
            }
            catch
            {
                _isInitialized = false;
            }
        }

        private IntPtr GetDisplayHandle(string targetName)
        {
            if (!_isInitialized) return IntPtr.Zero;
            string cleanTarget = (targetName ?? "").Trim().ToUpperInvariant();

            uint index = 0;
            IntPtr fallbackHandle = IntPtr.Zero;
            while (true)
            {
                IntPtr hDisp = IntPtr.Zero;
                int res = _nvEnum(index, ref hDisp);
                if (res != 0) break;

                byte[] nameBuf = new byte[64];
                _nvName(hDisp, nameBuf);
                string dName = Encoding.ASCII.GetString(nameBuf).TrimEnd('\0').ToUpperInvariant();

                if (index == 0) fallbackHandle = hDisp;

                if (!string.IsNullOrEmpty(cleanTarget) && (dName == cleanTarget || dName.Contains(cleanTarget) || cleanTarget.Contains(dName)))
                {
                    return hDisp;
                }
                index++;
            }

            return fallbackHandle;
        }

        public int? GetVibrance(string displayName)
        {
            if (!_isInitialized) return null;
            try
            {
                IntPtr hDisp = GetDisplayHandle(displayName);
                if (hDisp == IntPtr.Zero) return null;

                NV_DISPLAY_DVC_INFO_EX dvc = new NV_DISPLAY_DVC_INFO_EX();
                dvc.version = (uint)Marshal.SizeOf(typeof(NV_DISPLAY_DVC_INFO_EX)) | (1 << 16);
                int res = _nvGetDvc(hDisp, 0, ref dvc);
                if (res == 0 && dvc.maxLevel > dvc.minLevel)
                {
                    double ratio = (double)(dvc.currentLevel - dvc.minLevel) / (double)(dvc.maxLevel - dvc.minLevel);
                    return (int)Math.Round(ratio * 100.0);
                }
            }
            catch {}
            return null;
        }

        public int? SetVibrance(string displayName, int percentage)
        {
            if (!_isInitialized) return null;
            try
            {
                IntPtr hDisp = GetDisplayHandle(displayName);
                if (hDisp == IntPtr.Zero) return null;

                NV_DISPLAY_DVC_INFO_EX dvc = new NV_DISPLAY_DVC_INFO_EX();
                dvc.version = (uint)Marshal.SizeOf(typeof(NV_DISPLAY_DVC_INFO_EX)) | (1 << 16);
                int res = _nvGetDvc(hDisp, 0, ref dvc);
                if (res != 0 || dvc.maxLevel <= dvc.minLevel) return null;

                int clamped = Math.Max(0, Math.Min(100, percentage));
                dvc.currentLevel = (int)Math.Round(dvc.minLevel + (clamped / 100.0) * (dvc.maxLevel - dvc.minLevel));

                int setRes = _nvSetDvc(hDisp, 0, ref dvc);
                if (setRes == 0)
                {
                    return GetVibrance(displayName);
                }
            }
            catch {}
            return null;
        }

        public void Dispose()
        {
            if (_isInitialized && _nvUnload != null)
            {
                try { _nvUnload(); } catch {}
                _isInitialized = false;
            }
        }
    }

    public class Program
    {
        public static void Main(string[] args)
        {
            Console.OutputEncoding = Encoding.UTF8;
            string command = args.Length > 0 ? args[0].ToLowerInvariant() : "get-state";

            try
            {
                using (var nvidia = new NvidiaManager())
                {
                    switch (command)
                    {
                        case "get-state":
                            HandleGetState(nvidia);
                            break;

                        case "set-resolution":
                            if (args.Length < 4)
                            {
                                OutputJsonError("Uso: set-resolution <displayName> <width> <height> [frequency]");
                                return;
                            }
                            string resDisp = args[1];
                            int width = int.Parse(args[2], CultureInfo.InvariantCulture);
                            int height = int.Parse(args[3], CultureInfo.InvariantCulture);
                            int freq = args.Length > 4 ? int.Parse(args[4], CultureInfo.InvariantCulture) : 0;
                            HandleSetResolution(resDisp, width, height, freq);
                            break;

                        case "set-vibrance":
                            if (args.Length < 3)
                            {
                                OutputJsonError("Uso: set-vibrance <displayName> <percentage>");
                                return;
                            }
                            string vibDisp = args[1];
                            int vibPct = int.Parse(args[2], CultureInfo.InvariantCulture);
                            HandleSetVibrance(nvidia, vibDisp, vibPct);
                            break;

                        case "apply-profile":
                            if (args.Length < 4)
                            {
                                OutputJsonError("Uso: apply-profile <displayName> <width> <height> [frequency] [vibrance]");
                                return;
                            }
                            string profDisp = args[1];
                            int profW = int.Parse(args[2], CultureInfo.InvariantCulture);
                            int profH = int.Parse(args[3], CultureInfo.InvariantCulture);
                            int profHz = args.Length > 4 ? int.Parse(args[4], CultureInfo.InvariantCulture) : 0;
                            int? profVib = null;
                            if (args.Length > 5 && !string.IsNullOrEmpty(args[5]) && args[5] != "-1" && args[5].ToLowerInvariant() != "null")
                            {
                                profVib = int.Parse(args[5], CultureInfo.InvariantCulture);
                            }
                            HandleApplyProfile(nvidia, profDisp, profW, profH, profHz, profVib);
                            break;

                        default:
                            OutputJsonError("Comando no reconocido: " + command);
                            break;
                    }
                }
            }
            catch (Exception ex)
            {
                OutputJsonError(ex.Message);
            }
        }

        private static void HandleGetState(NvidiaManager nvidia)
        {
            var displays = new List<DisplayDeviceInfo>();

            for (uint i = 0; i < 16; i++)
            {
                var dev = new DISPLAY_DEVICE();
                dev.cb = Marshal.SizeOf(typeof(DISPLAY_DEVICE));
                if (!NativeMethods.EnumDisplayDevicesW(null, i, ref dev, 0))
                    continue;

                DEVMODE currentMode = new DEVMODE();
                currentMode.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE));
                if (!NativeMethods.EnumDisplaySettingsW(dev.DeviceName, NativeMethods.ENUM_CURRENT_SETTINGS, ref currentMode))
                    continue;

                bool isPrimary = (dev.StateFlags & NativeMethods.DISPLAY_DEVICE_PRIMARY_DEVICE) != 0;

                // Collect all available modes
                var modesMap = new Dictionary<string, DisplayModeInfo>();
                var frequencies = new List<int>();
                int modeIndex = 0;
                while (true)
                {
                    DEVMODE dm = new DEVMODE();
                    dm.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE));
                    if (!NativeMethods.EnumDisplaySettingsW(dev.DeviceName, modeIndex, ref dm))
                        break;

                    string key = string.Format("{0}x{1}@{2}", dm.dmPelsWidth, dm.dmPelsHeight, dm.dmDisplayFrequency);
                    if (!modesMap.ContainsKey(key))
                    {
                        modesMap[key] = new DisplayModeInfo
                        {
                            Width = dm.dmPelsWidth,
                            Height = dm.dmPelsHeight,
                            BitsPerPel = dm.dmBitsPerPel,
                            Frequency = dm.dmDisplayFrequency
                        };
                    }
                    if (!frequencies.Contains(dm.dmDisplayFrequency))
                    {
                        frequencies.Add(dm.dmDisplayFrequency);
                    }
                    modeIndex++;
                }

                frequencies.Sort();

                int? vibrance = nvidia.IsAvailable ? nvidia.GetVibrance(dev.DeviceName) : null;

                displays.Add(new DisplayDeviceInfo
                {
                    Name = dev.DeviceName,
                    DeviceString = dev.DeviceString,
                    IsPrimary = isPrimary,
                    CurrentMode = new DisplayModeInfo
                    {
                        Width = currentMode.dmPelsWidth,
                        Height = currentMode.dmPelsHeight,
                        BitsPerPel = currentMode.dmBitsPerPel,
                        Frequency = currentMode.dmDisplayFrequency
                    },
                    SupportedFrequencies = frequencies,
                    AvailableModes = new List<DisplayModeInfo>(modesMap.Values),
                    NvidiaSupported = nvidia.IsAvailable && vibrance.HasValue,
                    CurrentVibrance = vibrance
                });
            }

            var sb = new StringBuilder();
            sb.Append("{\"ok\":true,\"nvidiaReady\":").Append(nvidia.IsAvailable ? "true" : "false");
            sb.Append(",\"displays\":[");

            for (int d = 0; d < displays.Count; d++)
            {
                if (d > 0) sb.Append(",");
                var disp = displays[d];
                sb.Append("{");
                sb.Append("\"name\":").Append(EscapeJson(disp.Name)).Append(",");
                sb.Append("\"deviceString\":").Append(EscapeJson(disp.DeviceString)).Append(",");
                sb.Append("\"isPrimary\":").Append(disp.IsPrimary ? "true" : "false").Append(",");
                sb.Append("\"currentMode\":{")
                  .Append("\"width\":").Append(disp.CurrentMode.Width).Append(",")
                  .Append("\"height\":").Append(disp.CurrentMode.Height).Append(",")
                  .Append("\"frequency\":").Append(disp.CurrentMode.Frequency).Append(",")
                  .Append("\"bitsPerPel\":").Append(disp.CurrentMode.BitsPerPel)
                  .Append("},");
                sb.Append("\"nvidiaSupported\":").Append(disp.NvidiaSupported ? "true" : "false").Append(",");
                sb.Append("\"currentVibrance\":").Append(disp.CurrentVibrance.HasValue ? disp.CurrentVibrance.Value.ToString(CultureInfo.InvariantCulture) : "null").Append(",");
                
                sb.Append("\"frequencies\":[");
                for (int f = 0; f < disp.SupportedFrequencies.Count; f++)
                {
                    if (f > 0) sb.Append(",");
                    sb.Append(disp.SupportedFrequencies[f]);
                }
                sb.Append("],");

                sb.Append("\"availableModes\":[");
                for (int m = 0; m < disp.AvailableModes.Count; m++)
                {
                    if (m > 0) sb.Append(",");
                    var mode = disp.AvailableModes[m];
                    sb.Append("{\"width\":").Append(mode.Width)
                      .Append(",\"height\":").Append(mode.Height)
                      .Append(",\"frequency\":").Append(mode.Frequency)
                      .Append(",\"bitsPerPel\":").Append(mode.BitsPerPel)
                      .Append("}");
                }
                sb.Append("]");
                sb.Append("}");
            }

            sb.Append("]}");
            Console.WriteLine(sb.ToString());
        }

        private static void HandleSetResolution(string displayName, int width, int height, int frequency)
        {
            DEVMODE before = new DEVMODE();
            before.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE));
            if (!NativeMethods.EnumDisplaySettingsW(displayName, NativeMethods.ENUM_CURRENT_SETTINGS, ref before))
            {
                OutputJsonError("No se pudo leer la configuración actual de la pantalla " + displayName);
                return;
            }

            // Find matching modes
            int targetHz = frequency;
            int modeIndex = 0;
            var matches = new List<DEVMODE>();
            while (true)
            {
                DEVMODE dm = new DEVMODE();
                dm.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE));
                if (!NativeMethods.EnumDisplaySettingsW(displayName, modeIndex, ref dm))
                    break;
                if (dm.dmPelsWidth == width && dm.dmPelsHeight == height)
                {
                    matches.Add(dm);
                }
                modeIndex++;
            }

            if (matches.Count == 0)
            {
                OutputJsonError(string.Format("La resolución {0}x{1} no está disponible. Si es personalizada, créala primero en el Panel de NVIDIA.", width, height));
                return;
            }

            if (targetHz <= 0)
            {
                // Prefer same frequency as current, or max available
                bool foundSame = false;
                foreach (var m in matches)
                {
                    if (m.dmDisplayFrequency == before.dmDisplayFrequency)
                    {
                        targetHz = m.dmDisplayFrequency;
                        foundSame = true;
                        break;
                    }
                }
                if (!foundSame)
                {
                    int maxHz = 0;
                    foreach (var m in matches)
                    {
                        if (m.dmDisplayFrequency > maxHz) maxHz = m.dmDisplayFrequency;
                    }
                    targetHz = maxHz > 0 ? maxHz : matches[0].dmDisplayFrequency;
                }
            }

            DEVMODE target = new DEVMODE();
            target.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE));
            target.dmPelsWidth = width;
            target.dmPelsHeight = height;
            target.dmDisplayFrequency = targetHz;
            target.dmFields = NativeMethods.DM_PELSWIDTH | NativeMethods.DM_PELSHEIGHT | NativeMethods.DM_DISPLAYFREQUENCY;

            int test = NativeMethods.ChangeDisplaySettingsExW(displayName, ref target, IntPtr.Zero, NativeMethods.CDS_TEST, IntPtr.Zero);
            if (test != NativeMethods.DISP_CHANGE_SUCCESSFUL)
            {
                OutputJsonError(string.Format("Windows no acepta el modo {0}x{1}@{2}Hz.", width, height, targetHz));
                return;
            }

            int apply = NativeMethods.ChangeDisplaySettingsExW(displayName, ref target, IntPtr.Zero, NativeMethods.CDS_UPDATEREGISTRY, IntPtr.Zero);
            if (apply != NativeMethods.DISP_CHANGE_SUCCESSFUL && apply != NativeMethods.DISP_CHANGE_RESTART)
            {
                OutputJsonError(string.Format("Error al aplicar la resolución en Windows (Código {0}).", apply));
                return;
            }

            DEVMODE current = new DEVMODE();
            current.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE));
            NativeMethods.EnumDisplaySettingsW(displayName, NativeMethods.ENUM_CURRENT_SETTINGS, ref current);

            Console.WriteLine(string.Format(CultureInfo.InvariantCulture,
                "{{\"ok\":true,\"message\":\"Resolución aplicada correctamente\",\"mode\":{{\"width\":{0},\"height\":{1},\"frequency\":{2},\"bitsPerPel\":{3}}}}}",
                current.dmPelsWidth, current.dmPelsHeight, current.dmDisplayFrequency, current.dmBitsPerPel));
        }

        private static void HandleSetVibrance(NvidiaManager nvidia, string displayName, int percentage)
        {
            if (!nvidia.IsAvailable)
            {
                OutputJsonError("Controlador NVIDIA NVAPI no disponible en este sistema.");
                return;
            }

            int? newPct = nvidia.SetVibrance(displayName, percentage);
            if (!newPct.HasValue)
            {
                OutputJsonError("No se pudo ajustar el Digital Vibrance.");
                return;
            }

            Console.WriteLine(string.Format(CultureInfo.InvariantCulture,
                "{{\"ok\":true,\"message\":\"Digital Vibrance ajustado a {0}%\",\"vibrance\":{0}}}",
                newPct.Value));
        }

        private static void HandleApplyProfile(NvidiaManager nvidia, string displayName, int width, int height, int frequency, int? vibrance)
        {
            HandleSetResolution(displayName, width, height, frequency);
            if (vibrance.HasValue && nvidia.IsAvailable)
            {
                nvidia.SetVibrance(displayName, vibrance.Value);
            }
        }

        private static void OutputJsonError(string message)
        {
            Console.WriteLine(string.Format("{{\"ok\":false,\"error\":{0}}}", EscapeJson(message)));
        }

        private static string EscapeJson(string str)
        {
            if (str == null) return "null";
            var sb = new StringBuilder("\"");
            foreach (char c in str)
            {
                if (c == '\\') sb.Append("\\\\");
                else if (c == '"') sb.Append("\\\"");
                else if (c == '\n') sb.Append("\\n");
                else if (c == '\r') sb.Append("\\r");
                else if (c == '\t') sb.Append("\\t");
                else sb.Append(c);
            }
            sb.Append("\"");
            return sb.ToString();
        }
    }
}
