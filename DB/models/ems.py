from sqlalchemy import Column, Integer, Float, DateTime, ForeignKey, Time
from sqlalchemy.orm import relationship
from datetime import datetime, timedelta
from ..database import Base

def get_ist_time():
    return datetime.utcnow() + timedelta(hours=5, minutes=30)


# =====================================================
# MACHINE EMS HISTORY
# =====================================================
class MachineEMSHistory(Base):
    __tablename__ = 'machine_ems_history'
    __table_args__ = {'schema': 'ems'}

    machine_id = Column(Integer, ForeignKey('configuration.machines.id'),primary_key=True)
    timestamp = Column(DateTime, primary_key=True, default=datetime.now)
    
    phase_a_voltage = Column(Float)
    phase_b_voltage = Column(Float)
    phase_c_voltage = Column(Float)
    
    frequency = Column(Float)
    
    total_instantaneous_power = Column(Float)
    
    phase_a_current = Column(Float)
    phase_b_current = Column(Float)
    phase_c_current = Column(Float)
    
    active_energy_delivered = Column(Float)


# =====================================================
# MACHINE EMS LIVE
# =====================================================

class MachineEMSLive(Base):
    __tablename__ = 'machine_ems_live'
    __table_args__ = {'schema': 'ems'}
    
    id = Column(Integer, primary_key=True, autoincrement=True)

    machine_id = Column(Integer, ForeignKey('configuration.machines.id', ondelete="CASCADE"), nullable=False)
    timestamp = Column(DateTime, default=datetime.now)
    
    status = Column(Integer)

    phase_a_voltage = Column(Float)
    phase_b_voltage = Column(Float)
    phase_c_voltage = Column(Float)

    frequency = Column(Float)

    total_instantaneous_power = Column(Float)

    phase_a_current = Column(Float)
    phase_b_current = Column(Float)
    phase_c_current = Column(Float)

    active_energy_delivered = Column(Float)
    
    
# =====================================================
# SHIFTWISE ENERGY LIVE
# =====================================================

class ShiftwiseEnergyLive(Base):
    __tablename__ = 'shiftwise_energy_live'
    __table_args__ = {'schema': 'ems'}

    id = Column(Integer, primary_key=True, autoincrement=True)
    
    machine_id = Column(Integer, ForeignKey('configuration.machines.id', ondelete="CASCADE"), nullable=False)
    
    timestamp = Column(DateTime, default=datetime.now)

    first_shift = Column(Float, default=0.0)

    second_shift = Column(Float, default=0.0)

    third_shift = Column(Float, default=0.0)

    total_energy = Column(Float, default=0.0)


# =====================================================
# SHIFTWISE ENERGY HISTORY
# =====================================================
class ShiftwiseEnergyHistory(Base):
    __tablename__ = 'shiftwise_energy_history'
    __table_args__ = {'schema': 'ems'}

    machine_id = Column(Integer, ForeignKey('configuration.machines.id'), primary_key=True)
    
    timestamp = Column(DateTime, primary_key=True, default=datetime.now)

    first_shift = Column(Float)

    second_shift = Column(Float)

    third_shift = Column(Float)

    total_energy = Column(Float)
    
    
# =====================================================
# EMS MACHINE STATUS HISTORY
# =====================================================

class EMSMachineStatusHistory(Base):

    __tablename__ = "ems_machine_status_history"
    __table_args__ = {'schema': 'ems'}

    machine_id = Column(Integer, ForeignKey('configuration.machines.id'), primary_key=True)

    timestamp = Column(DateTime, primary_key=True, default=datetime.now)

    status = Column(Integer, nullable=False)


# =====================================================
# SHIFT INFO
# =====================================================

class ShiftInfo(Base):

    __tablename__ = "shift_info"
    __table_args__ = {"schema": "ems"}

    id = Column(Integer, primary_key=True, autoincrement=True)

    start_time = Column(Time, nullable=False)

    end_time = Column(Time, nullable=False)
