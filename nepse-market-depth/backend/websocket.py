"""
WebSocket Connection Manager
"""

from fastapi import WebSocket
from typing import Dict, List, Set
import logging
import json
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections"""
    
    def __init__(self):
        # Store connections by symbol
        self.active_connections: Dict[str, Set[WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, symbol: str):
        """Connect WebSocket to symbol channel"""
        await websocket.accept()
        
        if symbol not in self.active_connections:
            self.active_connections[symbol] = set()
        
        self.active_connections[symbol].add(websocket)
        logger.info(f"WebSocket connected to {symbol}. Total: {len(self.active_connections[symbol])}")
    
    def disconnect(self, websocket: WebSocket, symbol: str):
        """Disconnect WebSocket from symbol channel"""
        if symbol in self.active_connections:
            self.active_connections[symbol].discard(websocket)
            
            if not self.active_connections[symbol]:
                del self.active_connections[symbol]
            
            logger.info(f"WebSocket disconnected from {symbol}")
    
    async def broadcast(self, symbol: str, data: dict):
        """Broadcast data to all connections for a symbol"""
        if symbol in self.active_connections:
            message = json.dumps(data)
            disconnected = set()
            
            for connection in self.active_connections[symbol]:
                try:
                    await connection.send_text(message)
                except Exception as e:
                    logger.error(f"Failed to send to WebSocket: {e}")
                    disconnected.add(connection)
            
            # Remove disconnected clients
            for conn in disconnected:
                self.active_connections[symbol].discard(conn)
    
    async def send_to_client(self, websocket: WebSocket, data: dict):
        """Send data to specific client"""
        try:
            await websocket.send_json(data)
        except Exception as e:
            logger.error(f"Failed to send to client: {e}")
    
    def get_connection_count(self, symbol: str) -> int:
        """Get number of connections for a symbol"""
        if symbol in self.active_connections:
            return len(self.active_connections[symbol])
        return 0
    
    def get_all_symbols(self) -> List[str]:
        """Get all symbols with active connections"""
        return list(self.active_connections.keys())


# Global manager instance
manager = ConnectionManager()
