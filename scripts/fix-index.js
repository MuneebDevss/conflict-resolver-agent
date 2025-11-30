const mongoose = require('mongoose');
require('dotenv').config();

async function fixIndex() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected!');

    const db = mongoose.connection.db;
    const collection = db.collection('conflicts');

    // List all indexes
    const indexes = await collection.indexes();
    console.log('Current indexes:', JSON.stringify(indexes, null, 2));

    // Drop all unnecessary indexes (keep only _id)
    const indexesToDrop = [
      'conflictId_1',
      'calendarId_1_status_1',
      'severity_1_resolutionPriority_-1',
      'overlapStart_1_overlapEnd_1',
      'resolution.appliedAt_1'
    ];

    for (const indexName of indexesToDrop) {
      try {
        await collection.dropIndex(indexName);
        console.log(`✅ Successfully dropped ${indexName} index`);
      } catch (error) {
        if (error.code === 27) {
          console.log(`ℹ️  Index ${indexName} does not exist (skipped)`);
        } else {
          console.error(`❌ Error dropping ${indexName}:`, error.message);
        }
      }
    }

    // List indexes after cleanup
    const indexesAfter = await collection.indexes();
    console.log('\nIndexes after cleanup:', JSON.stringify(indexesAfter, null, 2));

    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixIndex();
