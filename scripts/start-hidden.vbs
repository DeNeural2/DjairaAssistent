' Launches the assistant with no visible console window, for autostart at login.
' Output goes to logs\assistant.log for troubleshooting since nothing is on-screen.
Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

scriptDir = objFSO.GetParentFolderName(WScript.ScriptFullName)
projectDir = objFSO.GetParentFolderName(scriptDir)

objShell.CurrentDirectory = projectDir
objShell.Run "cmd /c node src\assistant.js >> logs\assistant.log 2>&1", 0, False
