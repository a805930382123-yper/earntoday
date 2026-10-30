using System;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Diagnostics;

internal static class Launcher
{
    private const string AppExecutableName = "earn-today.exe";

    [STAThread]
    private static int Main()
    {
        try
        {
            string launcherDirectory = Path.GetFullPath(Path.GetDirectoryName(
                Assembly.GetExecutingAssembly().Location) ?? Directory.GetCurrentDirectory());
            string appPath = Path.Combine(
                launcherDirectory, "src-tauri", "target", "release", AppExecutableName);

            if (!File.Exists(appPath))
            {
                ShowError("Launcher EXE must stay in the project root. Missing file:\r\n" + appPath);
                return 1;
            }

            Process.Start(new ProcessStartInfo
            {
                FileName = appPath,
                WorkingDirectory = launcherDirectory,
                UseShellExecute = true,
            });
            return 0;
        }
        catch (Exception error)
        {
            ShowError(error.ToString());
            return 1;
        }
    }

    private static void ShowError(string message)
    {
        MessageBox((IntPtr)0, message, "Earn Today Launcher", 0x10);
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int MessageBox(IntPtr owner, string text, string caption, uint type);
}
