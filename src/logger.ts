import * as vscode from 'vscode';

export class Logger implements vscode.Disposable {
  private readonly channel: vscode.LogOutputChannel;

  constructor() {
    this.channel = vscode.window.createOutputChannel('Claude Commit', { log: true });
  }

  info(message: string): void {
    this.channel.info(message);
  }

  warn(message: string): void {
    this.channel.warn(message);
  }

  error(message: string, error?: unknown): void {
    if (error instanceof Error) {
      this.channel.error(`${message}\n${error.stack ?? error.message}`);
    } else if (error !== undefined) {
      this.channel.error(`${message} ${String(error)}`);
    } else {
      this.channel.error(message);
    }
  }

  show(): void {
    this.channel.show(true);
  }

  dispose(): void {
    this.channel.dispose();
  }
}
