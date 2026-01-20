import 'dart:io';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:path/path.dart' as path; // Add path package to pubspec.yaml if needed

Future<void> uploadDocument(File imageFile) async {
  try {
    final supabase = Supabase.instance.client;
    final userId = supabase.auth.currentUser?.id;

    if (userId == null) {
      throw 'User tidak terlogin.';
    }

    // 1. Upload File ke Storage
    final fileExtension = path.extension(imageFile.path);
    final fileName = '${DateTime.now().toIso8601String()}$fileExtension';
    final filePath = '$userId/$fileName'; // Structure: documents/userId/filename

    await supabase.storage.from('documents').upload(
          filePath,
          imageFile,
          fileOptions: const FileOptions(cacheControl: '3600', upsert: false),
        );

    // 2. Ambil Public URL
    final String publicUrl = supabase.storage.from('documents').getPublicUrl(filePath);

    // 3. Update Tabel Profiles
    await supabase.from('profiles').update({
      'baptism_cert_url': publicUrl, // Simpan URL
      'status': 'pending',          // Reset status ke pending
    }).eq('id', userId);            // Target user yang sedang login

    // Tampilkan feedback sukses (Sesuaikan dengan UI framework Anda, misal: SnackBar/Toast)
    print("Berhasil dikirim, menunggu verifikasi Admin");
    
    // Jika menggunakan GetX/Provider/Bloc, bisa trigger state update di sini.

  } catch (e) {
    // Error Handling
    print('Terjadi kesalahan saat upload: $e');
    // Rethrow jika ingin di-catch di UI layer
    rethrow;
  }
}
