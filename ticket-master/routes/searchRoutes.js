// routes/userRoutes.js
import express from 'express';
import { searchRoutes } from '../controllers/searchController.js';
import { getBusData } from '../controllers/searchController.js';
import { searchBus } from '../controllers/searchController.js';

const Router = express.Router();

Router.get('/routes', searchRoutes);
Router.get('/busdata', getBusData); 
Router.get('/bus', searchBus);

export default Router;
