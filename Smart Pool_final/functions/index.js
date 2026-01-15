const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Khởi tạo Firebase Admin
admin.initializeApp();

// ========================
// 1. TỰ ĐỘNG XÓA DỮ LIỆU CŨ - GIỮ 100 BẢN GHI MỚI NHẤT
// ========================
exports.autoDeleteKeep100 = functions.pubsub
  .schedule("every 60 minutes") // Chạy mỗi giờ
  .timeZone("Asia/Ho_Chi_Minh")
  .onRun(async (context) => {
    console.log("Bắt đầu tự động xóa dữ liệu cũ...");
    
    try {
      // Duyệt qua 3 hồ bơi
      for (let poolId = 1; poolId <= 3; poolId++) {
        // Lấy tất cả records của pool, sắp xếp từ cũ đến mới
        const snapshot = await admin.firestore()
          .collection("pool_history")
          .where("poolId", "==", poolId)
          .orderBy("timestamp", "asc")
          .get();
        
        const totalRecords = snapshot.size;
        console.log(`Hồ ${poolId} có ${totalRecords} bản ghi`);
        
        // Nếu có hơn 100 records, xóa các records cũ
        if (totalRecords > 100) {
          const recordsToDelete = totalRecords - 100;
          const batch = admin.firestore().batch();
          
          // Lấy các documents cũ nhất để xóa
          for (let i = 0; i < recordsToDelete; i++) {
            batch.delete(snapshot.docs[i].ref);
          }
          
          await batch.commit();
          console.log(`Hồ ${poolId}: Đã xóa ${recordsToDelete} bản ghi cũ, giữ lại 100 bản ghi mới nhất`);
        } else {
          console.log(`Hồ ${poolId}: Chỉ có ${totalRecords} bản ghi, không cần xóa`);
        }
      }
      
      console.log("Hoàn thành tự động xóa dữ liệu!");
      return null;
    } catch (error) {
      console.error("Lỗi khi xóa dữ liệu:", error);
      return null;
    }
  });
