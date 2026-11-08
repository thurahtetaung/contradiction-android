param([string]$Executable = (Join-Path $PSScriptRoot '..\Windows\nw.exe'))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class OriginalGameIcon {
    public delegate bool ResourceCallback(IntPtr module, IntPtr type, IntPtr name, IntPtr param);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr LoadLibraryEx(string path, IntPtr file, uint flags);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] public static extern bool EnumResourceNames(IntPtr module, IntPtr type, ResourceCallback callback, IntPtr param);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindResource(IntPtr module, IntPtr name, IntPtr type);
    [DllImport("kernel32.dll")] public static extern IntPtr LoadResource(IntPtr module, IntPtr resource);
    [DllImport("kernel32.dll")] public static extern IntPtr LockResource(IntPtr resource);
    [DllImport("kernel32.dll")] public static extern uint SizeofResource(IntPtr module, IntPtr resource);
    [DllImport("kernel32.dll")] public static extern bool FreeLibrary(IntPtr module);
    [DllImport("user32.dll")] public static extern int LookupIconIdFromDirectoryEx(IntPtr bytes, bool icon, int width, int height, uint flags);
    public static byte[] Extract(string path) {
        IntPtr module = LoadLibraryEx(path, IntPtr.Zero, 2);
        if (module == IntPtr.Zero) throw new Exception("Cannot load icon resources");
        try {
            byte[] result = null;
            ResourceCallback callback = (m,t,n,p) => {
                IntPtr group = FindResource(m,n,t);
                IntPtr bytes = LockResource(LoadResource(m,group));
                int id = LookupIconIdFromDirectoryEx(bytes,true,256,256,0);
                IntPtr icon = FindResource(m,(IntPtr)id,(IntPtr)3);
                int size = (int)SizeofResource(m,icon);
                result = new byte[size];
                Marshal.Copy(LockResource(LoadResource(m,icon)),result,0,size);
                return false;
            };
            EnumResourceNames(module,(IntPtr)14,callback,IntPtr.Zero);
            if (result == null) throw new Exception("No original icon found");
            return result;
        } finally { FreeLibrary(module); }
    }
}
'@
$portBytes = [OriginalGameIcon]::Extract((Resolve-Path -LiteralPath $Executable).Path)
$portDestination = Join-Path $PSScriptRoot 'app\src\main\res\drawable-nodpi'
New-Item -ItemType Directory -Path $portDestination -Force | Out-Null
$portPng = Join-Path $portDestination 'game_icon.png'
if ($portBytes[0] -eq 137 -and $portBytes[1] -eq 80) {
    [IO.File]::WriteAllBytes($portPng,$portBytes)
} else {
    $portMemory = New-Object IO.MemoryStream
    $portWriter = New-Object IO.BinaryWriter($portMemory)
    $portWriter.Write([uint16]0); $portWriter.Write([uint16]1); $portWriter.Write([uint16]1)
    $portWriter.Write([byte]0); $portWriter.Write([byte]0); $portWriter.Write([byte]0); $portWriter.Write([byte]0)
    $portWriter.Write([uint16]1); $portWriter.Write([uint16]32)
    $portWriter.Write([uint32]$portBytes.Length); $portWriter.Write([uint32]22); $portWriter.Write($portBytes)
    $portMemory.Position = 0
    $portIcon = New-Object Drawing.Icon($portMemory,256,256)
    $portBitmap = $portIcon.ToBitmap()
    $portBitmap.Save($portPng,[Drawing.Imaging.ImageFormat]::Png)
    $portBitmap.Dispose(); $portIcon.Dispose(); $portWriter.Dispose(); $portMemory.Dispose()
}
$portImage = [Drawing.Image]::FromFile($portPng)
Write-Output ('Extracted original icon: ' + $portImage.Width + 'x' + $portImage.Height)
$portImage.Dispose()
