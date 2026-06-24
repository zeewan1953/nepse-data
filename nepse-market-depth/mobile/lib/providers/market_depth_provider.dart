import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';

class MarketDepthProvider extends ChangeNotifier {
  List<String> symbols = [];
  String selectedSymbol = 'NABIL';
  Map<String, dynamic>? marketDepth;
  bool isLoading = false;
  bool isWebSocketConnected = false;
  WebSocketChannel? _channel;

  final String baseUrl = 'http://10.0.2.2:8000/api'; // Android emulator localhost
  final String wsUrl = 'ws://10.0.2.2:8000/ws/depth';

  MarketDepthProvider() {
    fetchSymbols();
  }

  Future<void> fetchSymbols() async {
    try {
      final response = await http.get(Uri.parse('$baseUrl/symbols'));
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        symbols = List<String>.from(data['symbols'].map((s) => s['symbol']));
        notifyListeners();
        fetchMarketDepth();
      }
    } catch (e) {
      print('Error fetching symbols: $e');
    }
  }

  Future<void> fetchMarketDepth() async {
    isLoading = true;
    notifyListeners();

    try {
      final response = await http.get(Uri.parse('$baseUrl/depth/$selectedSymbol'));
      if (response.statusCode == 200) {
        marketDepth = json.decode(response.body);
        connectWebSocket();
      }
    } catch (e) {
      print('Error fetching market depth: $e');
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  void connectWebSocket() {
    _channel?.sink.close();
    
    try {
      _channel = WebSocketChannel.connect(Uri.parse('$wsUrl/$selectedSymbol'));
      isWebSocketConnected = true;
      notifyListeners();

      _channel!.stream.listen(
        (data) {
          final message = json.decode(data);
          if (message['type'] == 'update') {
            marketDepth = message['data'];
            notifyListeners();
          }
        },
        onDone: () {
          isWebSocketConnected = false;
          notifyListeners();
        },
        onError: (e) {
          print('WebSocket error: $e');
          isWebSocketConnected = false;
          notifyListeners();
        },
      );
    } catch (e) {
      print('Error connecting WebSocket: $e');
      isWebSocketConnected = false;
      notifyListeners();
    }
  }

  void updateSymbol(String symbol) {
    selectedSymbol = symbol;
    fetchMarketDepth();
  }

  @override
  void dispose() {
    _channel?.sink.close();
    super.dispose();
  }
}
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';

class MarketDepthProvider extends ChangeNotifier {
  List<String> _symbols = [];
  String _selectedSymbol = 'NABIL';
  Map<String, dynamic>? _marketDepth;
  bool _isLoading = false;
  String? _error;
  WebSocketChannel? _channel;
  bool _isConnected = false;

  List<String> get symbols => _symbols;
  String get selectedSymbol => _selectedSymbol;
  Map<String, dynamic>? get marketDepth => _marketDepth;
  bool get isLoading => _isLoading;
  String? get error => _error;
  bool get isConnected => _isConnected;

  MarketDepthProvider() {
    fetchSymbols();
  }

  Future<void> fetchSymbols() async {
    try {
      final response = await http.get(
        Uri.parse('http://localhost:8000/api/v1/symbols'),
      );

      if (response.statusCode == 200) {
        final List<dynamic> data = json.decode(response.body);
        _symbols = data.map((s) => s['symbol'] as String).toList();
        notifyListeners();
      }
    } catch (e) {
      _error = 'Failed to fetch symbols';
      notifyListeners();
    }
  }

  void setSelectedSymbol(String symbol) {
    _selectedSymbol = symbol;
    fetchMarketDepth();
    connectWebSocket();
  }

  Future<void> fetchMarketDepth() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final response = await http.get(
        Uri.parse('http://localhost:8000/api/v1/depth/$_selectedSymbol'),
      );

      if (response.statusCode == 200) {
        _marketDepth = json.decode(response.body);
        _error = null;
      } else {
        _error = 'Failed to fetch market depth';
      }
    } catch (e) {
      _error = 'Network error';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  void connectWebSocket() {
    _channel?.sink.close();

    try {
      _channel = WebSocketChannel.connect(
        Uri.parse('ws://localhost:8000/ws/depth/$_selectedSymbol'),
      );

      _isConnected = true;
      notifyListeners();

      _channel!.stream.listen(
        (data) {
          _marketDepth = json.decode(data);
          notifyListeners();
        },
        onError: (error) {
          _isConnected = false;
          notifyListeners();
        },
        onDone: () {
          _isConnected = false;
          notifyListeners();
        },
      );
    } catch (e) {
      _isConnected = false;
      notifyListeners();
    }
  }

  void disconnectWebSocket() {
    _channel?.sink.close();
    _isConnected = false;
    notifyListeners();
  }

  @override
  void dispose() {
    disconnectWebSocket();
    super.dispose();
  }
}
