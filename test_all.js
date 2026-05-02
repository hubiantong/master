const axios = require('axios');

const BASE_URL = 'http://localhost:8000';

const profile1 = { name: '张三', birthday: '1990-01-01', birth_time: '12:00', gender: '男' };
const profile2 = { name: '李四', birthday: '1992-02-02', birth_time: '14:00', gender: '女' };

const tests = [
  { name: '八字', path: '/api/bazi/analyze', data: { profile: profile1 } },
  { name: '日运', path: '/api/fortune/daily', data: { name: '张三', gender: '男', birthday: '1990-01-01', birth_time: '12:00', date: '2026-04-29' } },
  { name: '合婚', path: '/api/marriage/analyze', data: { left: profile1, right: profile2 } },
  { name: '事业合作', path: '/api/cooperation/analyze', data: { left: profile1, right: profile2 } },
  { name: '婆媳关系', path: '/api/mother-in-law/analyze', data: { left: profile1, right: profile2 } },
  { name: '知己', path: '/api/friend/analyze', data: { left: profile1, right: profile2 } },
  { name: '关系图谱', path: '/api/relationship/graph', data: { center_name: '张三', relations: [{ name: '李四', relation_type: '朋友' }] } },
  { name: '梅花', path: '/api/meihua/daily-decision', data: { question: '今天出门好吗', date: '2026-04-29' } },
  { name: '六爻', path: '/api/liuyao/divine', data: { question: '今天运气如何', date: '2026-04-29' } },
  { name: '塔罗', path: '/api/tarot/divine', data: { question: '感情发展', date: '2026-04-29' } },
  { name: '紫微排盘', path: '/api/ziwei/chart', data: { profile: profile1 } },
  { name: '紫微合婚', path: '/api/ziwei/marriage', data: { left: profile1, right: profile2 } },
  { name: '黄历', path: '/api/huangli', data: { date: '2026-04-29', activity: '嫁娶' } }
];

async function run() {
  let allPassed = true;
  for (const t of tests) {
    try {
      const res = await axios.post(`${BASE_URL}${t.path}`, t.data);
      console.log(`✅ ${t.name} OK (status: ${res.status}, hasAI: ${!!res.data.ai})`);
    } catch (err) {
      console.error(`❌ ${t.name} FAILED: ${err.message}`);
      if (err.response) console.error(err.response.data);
      allPassed = false;
    }
  }
  
  // Test PDF separately
  try {
    const res = await axios.post(`${BASE_URL}/api/marriage/pdf`, { left: profile1, right: profile2 }, { responseType: 'arraybuffer' });
    console.log(`✅ PDF导出 OK (status: ${res.status}, size: ${res.data.length})`);
  } catch(err) {
    console.error(`❌ PDF导出 FAILED: ${err.message}`);
    if (err.response && err.response.data) {
        console.error(err.response.data.toString());
    }
    allPassed = false;
  }

  process.exit(allPassed ? 0 : 1);
}
run();