from typing import Dict, List, Tuple
from decimal import Decimal
import json

class OrderFlowEngine:
    """Calculate order flow metrics and trading signals"""
    
    @staticmethod
    def calculate_order_flow(bids: List[Dict], asks: List[Dict]) -> Dict:
        """
        Calculate order flow metrics from market depth
        
        Args:
            bids: List of bid orders [{price, qty}, ...]
            asks: List of ask orders [{price, qty}, ...]
        
        Returns:
            Dict with buy_pressure, sell_pressure, imbalance, trend, signal
        """
        # Calculate total volumes
        total_bid_qty = sum(bid.get('qty', 0) for bid in bids)
        total_ask_qty = sum(ask.get('qty', 0) for ask in asks)
        
        total_volume = total_bid_qty + total_ask_qty
        
        if total_volume == 0:
            return {
                'buy_pressure': 0.5,
                'sell_pressure': 0.5,
                'imbalance': 0.0,
                'trend': 'SIDEWAYS',
                'signal': 'NEUTRAL'
            }
        
        # Calculate pressures
        buy_pressure = total_bid_qty / total_volume
        sell_pressure = total_ask_qty / total_volume
        
        # Calculate imbalance: (Buy - Sell) / (Buy + Sell)
        imbalance = (total_bid_qty - total_ask_qty) / total_volume
        
        # Determine trend
        if imbalance > 0.3:
            trend = 'BULLISH'
        elif imbalance < -0.3:
            trend = 'BEARISH'
        else:
            trend = 'SIDEWAYS'
        
        # Generate signal
        if imbalance > 0.5:
            signal = 'STRONG_BUY'
        elif imbalance > 0.3:
            signal = 'BUY'
        elif imbalance < -0.5:
            signal = 'STRONG_SELL'
        elif imbalance < -0.3:
            signal = 'SELL'
        else:
            signal = 'NEUTRAL'
        
        # Detect large orders (top 10% by quantity)
        large_orders = OrderFlowEngine._detect_large_orders(bids, asks)
        
        # Detect liquidity walls (unusually large orders at specific price levels)
        liquidity_walls = OrderFlowEngine._detect_liquidity_walls(bids, asks)
        
        return {
            'buy_pressure': round(buy_pressure, 4),
            'sell_pressure': round(sell_pressure, 4),
            'imbalance': round(imbalance, 4),
            'trend': trend,
            'signal': signal,
            'total_bid_qty': total_bid_qty,
            'total_ask_qty': total_ask_qty,
            'large_orders': large_orders,
            'liquidity_walls': liquidity_walls
        }
    
    @staticmethod
    def _detect_large_orders(bids: List[Dict], asks: List[Dict], threshold_multiplier: float = 2.0) -> Dict:
        """
        Detect unusually large orders
        
        Args:
            bids: List of bid orders
            asks: List of ask orders
            threshold_multiplier: Orders > (avg_qty * threshold_multiplier) are considered large
        
        Returns:
            Dict with large_bid and large_ask lists
        """
        large_orders = {
            'large_bids': [],
            'large_asks': []
        }
        
        if not bids or not asks:
            return large_orders
        
        # Calculate average quantities
        avg_bid_qty = sum(b['qty'] for b in bids) / len(bids)
        avg_ask_qty = sum(a['qty'] for a in asks) / len(asks)
        
        # Find large orders
        for bid in bids:
            if bid['qty'] > avg_bid_qty * threshold_multiplier:
                large_orders['large_bids'].append({
                    'price': bid['price'],
                    'qty': bid['qty'],
                    'size_ratio': round(bid['qty'] / avg_bid_qty, 2)
                })
        
        for ask in asks:
            if ask['qty'] > avg_ask_qty * threshold_multiplier:
                large_orders['large_asks'].append({
                    'price': ask['price'],
                    'qty': ask['qty'],
                    'size_ratio': round(ask['qty'] / avg_ask_qty, 2)
                })
        
        return large_orders
    
    @staticmethod
    def _detect_liquidity_walls(bids: List[Dict], asks: List[Dict], wall_threshold: int = 10000) -> Dict:
        """
        Detect liquidity walls (very large orders that may act as support/resistance)
        
        Args:
            bids: List of bid orders
            asks: List of ask orders
            wall_threshold: Minimum quantity to be considered a wall
        
        Returns:
            Dict with bid_wall and ask_wall info
        """
        walls = {
            'bid_wall': None,
            'ask_wall': None
        }
        
        # Find largest bid (support)
        if bids:
            largest_bid = max(bids, key=lambda x: x['qty'])
            if largest_bid['qty'] >= wall_threshold:
                walls['bid_wall'] = {
                    'price': largest_bid['price'],
                    'qty': largest_bid['qty'],
                    'strength': 'STRONG' if largest_bid['qty'] >= wall_threshold * 2 else 'MODERATE'
                }
        
        # Find largest ask (resistance)
        if asks:
            largest_ask = max(asks, key=lambda x: x['qty'])
            if largest_ask['qty'] >= wall_threshold:
                walls['ask_wall'] = {
                    'price': largest_ask['price'],
                    'qty': largest_ask['qty'],
                    'strength': 'STRONG' if largest_ask['qty'] >= wall_threshold * 2 else 'MODERATE'
                }
        
        return walls
    
    @staticmethod
    def calculate_momentum(current_flow: Dict, previous_flow: Dict) -> Dict:
        """
        Calculate momentum shift between two flow snapshots
        
        Args:
            current_flow: Current order flow metrics
            previous_flow: Previous order flow metrics
        
        Returns:
            Dict with momentum analysis
        """
        if not previous_flow:
            return {
                'momentum': 'NEUTRAL',
                'shift': 0.0,
                'description': 'No previous data'
            }
        
        current_imbalance = current_flow.get('imbalance', 0)
        previous_imbalance = previous_flow.get('imbalance', 0)
        
        shift = current_imbalance - previous_imbalance
        
        if shift > 0.1:
            momentum = 'BULLISH_ACCELERATION'
            description = 'Buy pressure increasing'
        elif shift < -0.1:
            momentum = 'BEARISH_ACCELERATION'
            description = 'Sell pressure increasing'
        elif abs(shift) < 0.05:
            momentum = 'STABLE'
            description = 'Pressure stable'
        else:
            momentum = 'SHIFTING'
            description = 'Pressure shifting'
        
        return {
            'momentum': momentum,
            'shift': round(shift, 4),
            'description': description,
            'previous_imbalance': previous_imbalance,
            'current_imbalance': current_imbalance
        }
    
    @staticmethod
    def format_visualization_data(flow_data: Dict) -> Dict:
        """
        Format data for UI visualization
        
        Returns formatted data for charts and progress bars
        """
        buy_pct = flow_data['buy_pressure'] * 100
        sell_pct = flow_data['sell_pressure'] * 100
        
        # Generate progress bar representation
        buy_bars = '█' * int(buy_pct / 5)
        sell_bars = '█' * int(sell_pct / 5)
        
        trend_emoji = {
            'BULLISH': '🟢',
            'BEARISH': '🔴',
            'SIDEWAYS': '🟡'
        }
        
        signal_emoji = {
            'STRONG_BUY': '🔥🔥',
            'BUY': '🔥',
            'NEUTRAL': '⚪',
            'SELL': '💧',
            'STRONG_SELL': '💧💧'
        }
        
        return {
            'buy_pressure_pct': round(buy_pct, 2),
            'sell_pressure_pct': round(sell_pct, 2),
            'buy_bar': buy_bars,
            'sell_bar': sell_bars,
            'trend_emoji': trend_emoji.get(flow_data['trend'], '⚪'),
            'signal_emoji': signal_emoji.get(flow_data['signal'], '⚪'),
            'display_text': f"""
BUY PRESSURE: {buy_pct:.0f}%
{buy_bars}

SELL PRESSURE: {sell_pct:.0f}%
{sell_bars}

TREND: {flow_data['trend']} {trend_emoji.get(flow_data['trend'], '⚪')}
SIGNAL: {flow_data['signal']} {signal_emoji.get(flow_data['signal'], '⚪')}
"""
        }
