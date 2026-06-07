import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes';
import orderRoutes from './routes/order.routes';
import vehicleRoutes from './routes/vehicle.routes';
import driverRoutes from './routes/driver.routes';
import customerRoutes from './routes/customer.routes';
import routeRoutes from './routes/route.routes';
import dispatchRoutes from './routes/dispatch.routes';
import loadingRoutes from './routes/loading.routes';
import deliveryRoutes from './routes/delivery.routes';
import dashboardRoutes from './routes/dashboard.routes';
import warehouseRoutes from './routes/warehouse.routes';
import temperatureZoneRoutes from './routes/temperatureZone.routes';
import exceptionRoutes from './routes/exception.routes';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/dispatch', dispatchRoutes);
app.use('/api/loading', loadingRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/warehouse', warehouseRoutes);
app.use('/api/temperature-zone', temperatureZoneRoutes);
app.use('/api/exceptions', exceptionRoutes);

app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', message: '冷链物流配送系统 API 服务正常运行' });
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ message: '服务器内部错误', error: err.message });
});

app.use((req: Request, res: Response) => {
  res.status(404).json({ message: '接口不存在' });
});

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});

export default app;
