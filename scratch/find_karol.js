import { db } from './src/firebase.js';
import { collection, getDocs, query, where } from 'firebase/firestore';

async function findKarol() {
  const snapshot = await getDocs(collection(db, 'users'));
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.firstName?.toLowerCase().includes('karol')) {
      console.log(`Karol UID: ${doc.id}`);
    }
  });
}
findKarol();
