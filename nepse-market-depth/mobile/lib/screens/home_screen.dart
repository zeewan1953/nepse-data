import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../providers/market_depth_provider.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('NEPSE Market Depth'),
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
        actions: [
          Consumer<MarketDepthProvider>(
            builder: (context, provider, child) {
              return Padding(
                padding: const EdgeInsets.only(right: 16.0),
                child: Row(
                  children: [
                    Icon(
                      provider.isWebSocketConnected ? Icons.wifi : Icons.wifi_off,
                      color: provider.isWebSocketConnected ? Colors.green : Colors.red,
                      size: 20,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      provider.isWebSocketConnected ? 'Live' : 'Offline',
                      style: const TextStyle(fontSize: 12),
                    ),
                  ],
                ),
              );
            },
          ),
        ],
      ),
      body: Consumer<MarketDepthProvider>(
        builder: (context, provider, child) {
          return Column(
            children: [
              // Symbol Selector
              Padding(
                padding: const EdgeInsets.all(16.0),
                child: DropdownButtonFormField<String>(
                  value: provider.selectedSymbol,
                  decoration: const InputDecoration(
                    labelText: 'Select Symbol',
                    border: OutlineInputBorder(),
                  ),
                  items: provider.symbols.map((symbol) {
                    return DropdownMenuItem(
                      value: symbol,
                      child: Text(symbol),
                    );
                  }).toList(),
                  onChanged: (value) {
                    if (value != null) {
                      provider.updateSymbol(value);
                    }
                  },
                ),
              ),

              // Loading Indicator
              if (provider.isLoading)
                const Expanded(
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (provider.marketDepth == null)
                const Expanded(
                  child: Center(child: Text('No data available')),
                )
              else
                Expanded(
                  child: RefreshIndicator(
                    onRefresh: () => provider.fetchMarketDepth(),
                    child: ListView(
                      padding: const EdgeInsets.all(16.0),
                      children: [
                        // Summary Card
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(16.0),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Market Summary',
                                  style: Theme.of(context).textTheme.titleLarge,
                                ),
                                const SizedBox(height: 12),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                                  children: [
                                    _buildSummaryItem(
                                      context,
                                      'Best Bid',
                                      '₨${provider.marketDepth!['bids'][0]['price'].toStringAsFixed(2)}',
                                      Colors.green,
                                    ),
                                    _buildSummaryItem(
                                      context,
                                      'Best Ask',
                                      '₨${provider.marketDepth!['asks'][0]['price'].toStringAsFixed(2)}',
                                      Colors.red,
                                    ),
                                    _buildSummaryItem(
                                      context,
                                      'Spread',
                                      '₨${(provider.marketDepth!['asks'][0]['price'] - provider.marketDepth!['bids'][0]['price']).toStringAsFixed(2)}',
                                      Colors.blue,
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),

                        // Bids and Asks
                        Row(
                          children: [
                            Expanded(
                              child: _buildDepthCard(
                                context,
                                'Bids',
                                provider.marketDepth!['bids'],
                                Colors.green,
                                provider.marketDepth!['total_bid_qty'],
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: _buildDepthCard(
                                context,
                                'Asks',
                                provider.marketDepth!['asks'],
                                Colors.red,
                                provider.marketDepth!['total_ask_qty'],
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildSummaryItem(BuildContext context, String label, String value, Color color) {
    return Column(
      children: [
        Text(
          label,
          style: const TextStyle(fontSize: 12, color: Colors.grey),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
      ],
    );
  }

  Widget _buildDepthCard(BuildContext context, String title, List<dynamic> data, Color color, int totalQty) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: color,
                  ),
                ),
                Text(
                  '${data.length} levels',
                  style: const TextStyle(fontSize: 12, color: Colors.grey),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'Total: ${totalQty.toString()} shares',
              style: const TextStyle(fontSize: 12),
            ),
            const SizedBox(height: 12),
            const Row(
              children: [
                Expanded(
                  child: Text(
                    'Price',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                  ),
                ),
                Expanded(
                  child: Text(
                    'Qty',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                    textAlign: TextAlign.right,
                  ),
                ),
              ],
            ),
            const Divider(),
            SizedBox(
              height: 300,
              child: ListView.builder(
                itemCount: data.length > 10 ? 10 : data.length,
                itemBuilder: (context, index) {
                  final item = data[index];
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4.0),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          '₨${item['price'].toStringAsFixed(2)}',
                          style: TextStyle(color: color, fontSize: 14),
                        ),
                        Text(
                          item['qty'].toString(),
                          style: const TextStyle(fontSize: 14),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/market_depth_provider.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('NEPSE Market Depth'),
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
      ),
      body: Consumer<MarketDepthProvider>(
        builder: (context, provider, child) {
          if (provider.isLoading) {
            return const Center(child: CircularProgressIndicator());
          }

          if (provider.error != null) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.error_outline, size: 64, color: Colors.red),
                  const SizedBox(height: 16),
                  Text(provider.error!),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () => provider.fetchMarketDepth(),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            );
          }

          if (provider.marketDepth == null) {
            return const Center(child: Text('No data available'));
          }

          final depth = provider.marketDepth!;
          final bids = List<Map<String, dynamic>>.from(depth['bids'] ?? []);
          final asks = List<Map<String, dynamic>>.from(depth['asks'] ?? []);

          return Column(
            children: [
              // Symbol selector
              Padding(
                padding: const EdgeInsets.all(16.0),
                child: DropdownButtonFormField<String>(
                  value: provider.selectedSymbol,
                  decoration: const InputDecoration(
                    labelText: 'Select Symbol',
                    border: OutlineInputBorder(),
                  ),
                  items: provider.symbols.map((symbol) {
                    return DropdownMenuItem(
                      value: symbol,
                      child: Text(symbol),
                    );
                  }).toList(),
                  onChanged: (value) {
                    if (value != null) {
                      provider.setSelectedSymbol(value);
                    }
                  },
                ),
              ),

              // Connection status
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16.0),
                child: Row(
                  children: [
                    Icon(
                      provider.isConnected ? Icons.circle : Icons.circle_outlined,
                      color: provider.isConnected ? Colors.green : Colors.grey,
                      size: 12,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      provider.isConnected ? 'Live' : 'Disconnected',
                      style: TextStyle(
                        color: provider.isConnected ? Colors.green : Colors.grey,
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 16),

              // Market depth display
              Expanded(
                child: Row(
                  children: [
                    // Bids
                    Expanded(
                      child: Column(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(12),
                            color: Colors.green.shade50,
                            child: const Text(
                              'BIDS',
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                color: Colors.green,
                              ),
                            ),
                          ),
                          Expanded(
                            child: ListView.builder(
                              itemCount: bids.length,
                              itemBuilder: (context, index) {
                                final bid = bids[index];
                                return ListTile(
                                  dense: true,
                                  title: Text(
                                    'Rs. ${bid['price']}',
                                    style: const TextStyle(
                                      color: Colors.green,
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                  subtitle: Text('${bid['qty']} shares'),
                                );
                              },
                            ),
                          ),
                        ],
                      ),
                    ),

                    // Divider
                    const VerticalDivider(width: 1),

                    // Asks
                    Expanded(
                      child: Column(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(12),
                            color: Colors.red.shade50,
                            child: const Text(
                              'ASKS',
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                color: Colors.red,
                              ),
                            ),
                          ),
                          Expanded(
                            child: ListView.builder(
                              itemCount: asks.length,
                              itemBuilder: (context, index) {
                                final ask = asks[index];
                                return ListTile(
                                  dense: true,
                                  title: Text(
                                    'Rs. ${ask['price']}',
                                    style: const TextStyle(
                                      color: Colors.red,
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                  subtitle: Text('${ask['qty']} shares'),
                                );
                              },
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              // Summary
              Container(
                padding: const EdgeInsets.all(16),
                color: Colors.grey.shade100,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    Column(
                      children: [
                        const Text('Spread', style: TextStyle(fontSize: 12)),
                        Text(
                          'Rs. ${depth['bid_ask_spread']}',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                    Column(
                      children: [
                        const Text('Best Bid', style: TextStyle(fontSize: 12)),
                        Text(
                          'Rs. ${bids.isNotEmpty ? bids[0]['price'] : 'N/A'}',
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            color: Colors.green,
                          ),
                        ),
                      ],
                    ),
                    Column(
                      children: [
                        const Text('Best Ask', style: TextStyle(fontSize: 12)),
                        Text(
                          'Rs. ${asks.isNotEmpty ? asks[0]['price'] : 'N/A'}',
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            color: Colors.red,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
