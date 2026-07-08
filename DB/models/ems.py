from sqlalchemy import Column, Integer, Float, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime, timedelta
from ..database import Base


def get_ist_time():
    return datetime.utcnow() + timedelta(hours=5, minutes=30)


class MachineEMSHistory(Base):
    __tablename__ = 'machine_ems_history'
    __table_args__ = {'schema': 'ems'}

    id = Column(Integer, primary_key=True, autoincrement=True)
    machine_id = Column(Integer, ForeignKey('configuration.machines.id'), nullable=False)
    timestamp = Column(DateTime, default=get_ist_time, nullable=False)
    phase_a_voltage = Column(Float, nullable=True)
    phase_b_voltage = Column(Float, nullable=True)
    phase_c_voltage = Column(Float, nullable=True)
    line_ab_voltage = Column(Float, nullable=True)
    line_bc_voltage = Column(Float, nullable=True)
    line_ca_voltage = Column(Float, nullable=True)
    phase_a_current = Column(Float, nullable=True)
    phase_b_current = Column(Float, nullable=True)
    phase_c_current = Column(Float, nullable=True)
    power_factor = Column(Float, nullable=True)
    frequency = Column(Float, nullable=True)
    total_instantaneous_power = Column(Float, nullable=True)
    active_energy_delivered = Column(Float, nullable=True)


class MachineEMSLive(Base):
    __tablename__ = 'machine_ems_live'
    __table_args__ = {'schema': 'ems'}

    machine_id = Column(Integer, ForeignKey('configuration.machines.id'), nullable=False, unique=True, primary_key=True)
    timestamp = Column(DateTime, default=get_ist_time, nullable=False)
    phase_a_voltage = Column(Float, nullable=True)
    phase_b_voltage = Column(Float, nullable=True)
    phase_c_voltage = Column(Float, nullable=True)
    line_ab_voltage = Column(Float, nullable=True)
    line_bc_voltage = Column(Float, nullable=True)
    line_ca_voltage = Column(Float, nullable=True)
    phase_a_current = Column(Float, nullable=True)
    phase_b_current = Column(Float, nullable=True)
    phase_c_current = Column(Float, nullable=True)
    power_factor = Column(Float, nullable=True)
    frequency = Column(Float, nullable=True)
    total_instantaneous_power = Column(Float, nullable=True)
    active_energy_delivered = Column(Float, nullable=True)
    status = Column(Integer, nullable=True)


class ShiftwiseEnergyLive(Base):
    __tablename__ = 'shiftwise_energy_live'
    __table_args__ = {'schema': 'ems'}

    machine_id = Column(Integer, ForeignKey('configuration.machines.id'), nullable=False, unique=True, primary_key=True)
    timestamp = Column(DateTime, default=get_ist_time, nullable=False)
    first_shift = Column(Float, nullable=False, default=0.0)
    second_shift = Column(Float, nullable=False, default=0.0)
    total_energy = Column(Float, nullable=False, default=0.0)


class ShiftwiseEnergyHistory(Base):
    __tablename__ = 'shiftwise_energy_history'
    __table_args__ = {'schema': 'ems'}

    id = Column(Integer, primary_key=True, autoincrement=True)
    machine_id = Column(Integer, ForeignKey('configuration.machines.id'), nullable=False)
    timestamp = Column(DateTime, default=get_ist_time, nullable=False)
    first_shift = Column(Float, nullable=False, default=0.0)
    second_shift = Column(Float, nullable=False, default=0.0)
    total_energy = Column(Float, nullable=False, default=0.0)
