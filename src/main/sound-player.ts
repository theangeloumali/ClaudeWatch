import { resolve, join } from 'path'
import { existsSync } from 'fs'
import { app } from 'electron'
import { execFilePromise } from './platform/exec'
import { POWERSHELL, childEnv, powershellArgs } from '../shared/platform-process'

// System.Media.SoundPlayer plays only WAV; the path travels in the env because PowerShell
// re-parses anything after -Command as code.
const WINDOWS_PLAY_SCRIPT =
  '(New-Object System.Media.SoundPlayer $env:CLAUDEWATCH_SOUND).PlaySync()'

export class SoundPlayer {
  private soundPath: string

  constructor(private readonly platform: NodeJS.Platform = process.platform) {
    const fileName = platform === 'win32' ? 'task-complete.wav' : 'task-complete.m4a'
    this.soundPath = app.isPackaged
      ? join(process.resourcesPath, 'sounds', fileName)
      : resolve(__dirname, '../../resources/sounds', fileName)
  }

  async playTaskComplete(): Promise<void> {
    if (!existsSync(this.soundPath)) {
      return
    }

    // A sound that fails to play is not worth reporting.
    if (this.platform === 'darwin') {
      await execFilePromise('afplay', [this.soundPath]).catch(() => undefined)
    } else if (this.platform === 'win32') {
      const env = { ...childEnv('win32'), CLAUDEWATCH_SOUND: this.soundPath }
      await execFilePromise(POWERSHELL, powershellArgs(WINDOWS_PLAY_SCRIPT), { env }).catch(
        () => undefined
      )
    }
  }
}
