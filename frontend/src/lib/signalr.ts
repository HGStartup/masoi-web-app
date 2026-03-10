import * as signalR from '@microsoft/signalr'

let connection: signalR.HubConnection | null = null

export function getConnection(): signalR.HubConnection {
  if (!connection) {
    connection = new signalR.HubConnectionBuilder()
      .withUrl('/gamehub')
      .withAutomaticReconnect()
      .build()
  }
  return connection
}

export async function startConnection(): Promise<signalR.HubConnection> {
  const conn = getConnection()
  if (conn.state === signalR.HubConnectionState.Disconnected) {
    await conn.start()
    console.log('[SignalR] Connected')
  }
  return conn
}
