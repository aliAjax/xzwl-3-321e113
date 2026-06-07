const fs = require('fs');
const path = require('path');

const routesPath = path.join('/Users/zhuanzmima0000/Desktop/label project/Solo coder 0601/xzwl-3/api/routes/delivery.routes.ts');

let content = fs.readFileSync(routesPath, 'utf-8');

const newRoute = "router.get('/nodes/:nodeId', authMiddleware, requireRoles('admin', 'dispatcher', 'driver'), deliveryController.getNodeById);";

content = content.replace(
  "router.get('/tasks/driver/:driverId?', authMiddleware, requireRoles('admin', 'dispatcher', 'driver'), deliveryController.getDriverTasks);",
  "router.get('/tasks/driver/:driverId?', authMiddleware, requireRoles('admin', 'dispatcher', 'driver'), deliveryController.getDriverTasks);\n" + newRoute
);

fs.writeFileSync(routesPath, content);
console.log('Routes updated successfully');
