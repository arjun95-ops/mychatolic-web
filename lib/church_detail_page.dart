import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

class ChurchDetailPage extends StatelessWidget {
  final Map<String, dynamic> churchData;

  const ChurchDetailPage({super.key, required this.churchData});

  Future<void> _launchUrl(String? urlString) async {
    if (urlString == null || urlString.isEmpty) return;
    final Uri url = Uri.parse(urlString);
    if (!await launchUrl(url, mode: LaunchMode.externalApplication)) {
      debugPrint('Could not launch $url');
    }
  }

  @override
  Widget build(BuildContext context) {
    // 1. Data Parsing
    final String name = churchData['name'] ?? 'Nama Gereja';
    final String address = churchData['address'] ?? 'Alamat tidak tersedia';
    final String? imageUrl = churchData['image_url'];
    
    // Social Links
    final String? mapsUrl = churchData['google_maps_url'];
    final String? instaUrl = churchData['instagram_url'];
    final String? webUrl = churchData['website_url'];

    // Schedules Parsing & Grouping
    // Assuming 'mass_schedules' is a List<dynamic> inside churchData
    // If it's fetched separately, you might need a FutureBuilder here.
    // For this implementation, we assume data is passed or we'd fetch it.
    // **ADJUSTMENT**: If data needs fetching, convert to StatefulWidget. 
    // Given the prompt implies "Fetch schedules...", I will implement a fetcher 
    // or assume it's passed. To be safe and robust, I'll use a FutureBuilder 
    // if a fetch function was provided, but usually detail pages receive data.
    // READ REQUEST AGAIN: "Fetch schedules from mass_schedules table using churchData['id']"
    // So we need Supabase fetching here.
    
    return Scaffold(
      backgroundColor: Colors.white, // Clean background
      body: CustomScrollView(
        slivers: [
          // 1. Large Header Image (SliverAppBar)
          SliverAppBar(
            expandedHeight: 250.0,
            floating: false,
            pinned: true,
            backgroundColor: const Color(0xFF2C225B), // Royal Purple
            leading: IconButton(
              icon: const Icon(Icons.arrow_back, color: Colors.white),
              onPressed: () => Navigator.of(context).pop(),
            ),
            flexibleSpace: FlexibleSpaceBar(
              background: imageUrl != null && imageUrl.isNotEmpty
                  ? Image.network(
                      imageUrl,
                      fit: BoxFit.cover,
                    )
                  : Container(
                      color: const Color(0xFF2C225B),
                      child: const Center(
                        child: Icon(Icons.church, size: 64, color: Colors.white24),
                      ),
                    ),
            ),
          ),

          // 2. Title & Action Section
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(24.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Title
                  Text(
                    name,
                    style: const TextStyle(
                      fontFamily: 'Serif', // Or your custom Serif font
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF1F1842),
                    ),
                  ),
                  const SizedBox(height: 8),
                  // Address
                  Text(
                    address,
                    style: const TextStyle(
                      fontSize: 14,
                      color: Colors.grey,
                      height: 1.5,
                    ),
                  ),
                  const SizedBox(height: 24),
                  
                  // Action Row (Maps, Insta, Web)
                  Row(
                    mainAxisAlignment: MainAxisAlignment.start,
                    children: [
                      _ActionButton(
                        icon: Icons.map,
                        label: "Maps",
                        onTap: () => _launchUrl(mapsUrl),
                        isActive: mapsUrl != null && mapsUrl.isNotEmpty,
                      ),
                      const SizedBox(width: 16),
                      _ActionButton(
                        icon: Icons.camera_alt, // Instagram-like
                        label: "Instagram",
                        onTap: () => _launchUrl(instaUrl),
                        isActive: instaUrl != null && instaUrl.isNotEmpty,
                      ),
                      const SizedBox(width: 16),
                      _ActionButton(
                        icon: Icons.language,
                        label: "Web",
                        onTap: () => _launchUrl(webUrl),
                        isActive: webUrl != null && webUrl.isNotEmpty,
                      ),
                    ],
                  ),
                  
                  const SizedBox(height: 32),
                  const Divider(),
                  const SizedBox(height: 16),
                ],
              ),
            ),
          ),

          // 3. Schedules Section (The Core)
          // We need to fetch data. I will use a specialized widget for this.
          SliverToBoxAdapter(
            child: _ScheduleSection(churchId: churchData['id']),
          ),
          
          const SliverPadding(padding: EdgeInsets.only(bottom: 40)),
        ],
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool isActive;

  const _ActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.isActive = true,
  });

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: isActive ? 1.0 : 0.4,
      child: InkWell(
        onTap: isActive ? onTap : null,
        borderRadius: BorderRadius.circular(50),
        child: Column(
          children: [
            Container(
              width: 50,
              height: 50,
              decoration: BoxDecoration(
                color: isActive ? const Color(0xFF2C225B) : Colors.grey[200],
                shape: BoxShape.circle,
                boxShadow: isActive
                    ? [
                        BoxShadow(
                          color: const Color(0xFF2C225B).withOpacity(0.3),
                          blurRadius: 8,
                          offset: const Offset(0, 4),
                        )
                      ]
                    : [],
              ),
              child: Icon(icon, color: isActive ? Colors.white : Colors.grey, size: 24),
            ),
            const SizedBox(height: 6),
            Text(
              label,
              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Colors.black87),
            )
          ],
        ),
      ),
    );
  }
}

// --- SCHEDULE SECTION WITH FETCH LOGIC ---

class _ScheduleSection extends StatelessWidget {
  final dynamic churchId;

  const _ScheduleSection({required this.churchId});

  Future<Map<String, List<Map<String, dynamic>>>> _fetchSchedules() async {
    try {
      final response = await Supabase.instance.client
          .from('mass_schedules')
          .select()
          .eq('church_id', churchId)
          .order('day_number')
          .order('start_time');

      final List<dynamic> data = response as List<dynamic>;
      
      final List<Map<String, dynamic>> schedules = 
          data.map((e) => e as Map<String, dynamic>).toList();

      final weekly = <Map<String, dynamic>>[];
      final daily = <Map<String, dynamic>>[];

      for (var s in schedules) {
        final rawDay = s['day_number'];
        final day = rawDay is num
            ? rawDay.toInt()
            : int.tryParse(rawDay?.toString() ?? '') ?? 7;
        if (day == 6 || day == 7) {
          weekly.add(s);
        } else {
          daily.add(s);
        }
      }
      
      // Sort days: Misa Harian custom sort (Senin -> Jumat) if needed
      // Currently just time sorted.
      
      return {
        'weekly': weekly,
        'daily': daily,
      };

    } catch (e) {
      debugPrint("Error fetching schedules: $e");
      return {'weekly': [], 'daily': []};
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Map<String, List<Map<String, dynamic>>>>(
      future: _fetchSchedules(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return const Padding(
            padding: EdgeInsets.all(16),
            child: Text("Gagal memuat jadwal."),
          );
        }

        final weekly = snapshot.data?['weekly'] ?? [];
        final daily = snapshot.data?['daily'] ?? [];

        if (weekly.isEmpty && daily.isEmpty) {
          return const Padding(
            padding: EdgeInsets.all(24.0),
            child: Center(
              child: Text(
                "Belum ada jadwal misa.",
                style: TextStyle(color: Colors.grey, fontStyle: FontStyle.italic),
              ),
            ),
          );
        }

        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const Text(
                "Jadwal Misa",
                style: TextStyle(
                  fontSize: 18, 
                  fontWeight: FontWeight.bold, 
                  letterSpacing: 1.0,
                  color: Color(0xFF1F1842)
                ),
              ),
              const SizedBox(height: 20),

              if (weekly.isNotEmpty) ...[
                _buildGroupTitle("Misa Mingguan (Weekly)"),
                ...weekly.map((s) => _buildScheduleRow(s)),
                const SizedBox(height: 20),
              ],

              if (daily.isNotEmpty) ...[
                _buildGroupTitle("Misa Harian (Daily)"),
                ...daily.map((s) => _buildScheduleRow(s)),
              ],
            ],
          ),
        );
      },
    );
  }

  Widget _buildGroupTitle(String title) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.only(bottom: 12, top: 4),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: Colors.black12)),
      ),
      margin: const EdgeInsets.only(bottom: 12),
      child: Text(
        title.toUpperCase(),
        style: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.bold,
          color: Colors.grey,
          letterSpacing: 1.2,
        ),
      ),
    );
  }

  String _dayLabelFromNumber(dynamic rawDay) {
    final day = rawDay is num
        ? rawDay.toInt()
        : int.tryParse(rawDay?.toString() ?? '') ?? 7;

    switch (day) {
      case 1:
        return 'Senin';
      case 2:
        return 'Selasa';
      case 3:
        return 'Rabu';
      case 4:
        return 'Kamis';
      case 5:
        return 'Jumat';
      case 6:
        return 'Sabtu';
      default:
        return 'Minggu';
    }
  }

  Widget _buildScheduleRow(Map<String, dynamic> schedule) {
    // Format Time: 06:00:00 -> 06:00
    String time = schedule['start_time'].toString();
    if(time.length > 5) time = time.substring(0, 5);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Text(
                time,
                style: const TextStyle(
                  fontFamily: 'Monospace', // Or a tabular sans
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF2C225B),
                ),
              ),
              const SizedBox(width: 12),
               Text(
                _dayLabelFromNumber(schedule['day_number']),
                style: const TextStyle(fontSize: 14, color: Colors.black87),
              ),
            ],
          ),
          
          if(schedule['notes'] != null && schedule['notes'].toString().isNotEmpty)
             Container(
               padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
               decoration: BoxDecoration(
                 color: const Color(0xFFD6FD51), // Your Lime Accent or similar
                 borderRadius: BorderRadius.circular(4),
               ),
               child: Text(
                schedule['notes'],
                style: const TextStyle(
                  fontSize: 10, 
                  fontWeight: FontWeight.bold,
                  color: Colors.black
                ),
              ),
             ),
        ],
      ),
    );
  }
}
